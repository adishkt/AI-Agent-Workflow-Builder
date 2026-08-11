import {
  createGraphQLClient,
} from "./lib/graphql.js";

import {
  getCurrentStep,
  getNextStep,
  failExecution,
  completeAndCreateNext,
  completeWorkflow,
} from "./lib/workflow.js";

import {
  executeLLMStep,
} from "./lib/llm.js";

export default async (
  req,
  res
) => {
  const startTime =
    Date.now();

  const FUNCTION_TIMEOUT =
    9000;

  const getRemainingTime =
    () =>
      FUNCTION_TIMEOUT -
      (Date.now() - startTime);

  try {
    // ==========================================================
    // 1. READ EVENT
    // ==========================================================

    const stepRun =
      req.body?.event?.data?.new;

    if (!stepRun) {
      return res.status(400).json({
        success: false,
        message:
          "step_run event data is missing",
      });
    }

    const stepRunId =
      stepRun.id;

    const workflowRunId =
      stepRun.workflow_run_id;

    const workflowStepId =
      stepRun.workflow_step_id;

    const stepInput =
      stepRun.input || {};

    if (
      !stepRunId ||
      !workflowRunId ||
      !workflowStepId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid step_run event data",
      });
    }

    console.log(
      `Starting step ${workflowStepId}`
    );

    console.log(
      `Workflow run: ${workflowRunId}`
    );

    // ==========================================================
    // 2. ENVIRONMENT
    // ==========================================================

    if (
      !process.env.NHOST_GRAPHQL_URL
    ) {
      throw new Error(
        "NHOST_GRAPHQL_URL is not configured"
      );
    }

    if (
      !process.env.NHOST_ADMIN_SECRET
    ) {
      throw new Error(
        "NHOST_ADMIN_SECRET is not configured"
      );
    }

    if (
      !process.env.OPENROUTER_API_KEY
    ) {
      throw new Error(
        "OPENROUTER_API_KEY is not configured"
      );
    }

    // ==========================================================
    // 3. GRAPHQL CLIENT
    // ==========================================================

    const graphqlRequest =
      createGraphQLClient({
        getRemainingTime,
      });

    // ==========================================================
    // 4. GET CURRENT STEP
    // ==========================================================

    const step =
      await getCurrentStep(
        graphqlRequest,
        workflowStepId
      );

    console.log(
      `Workflow ID: ${step.workflow_id}`
    );

    console.log(
      `Current step: ${step.name}`
    );

    console.log(
      `Current order: ${step.step_order}`
    );

    // ==========================================================
    // 5. GET NEXT STEP
    // ==========================================================

    const nextStep =
      await getNextStep(
        graphqlRequest,

        step.workflow_id,

        step.step_order
      );

    if (nextStep) {
      console.log(
        `Next step: ${nextStep.name}`
      );
    } else {
      console.log(
        "This is the final workflow step"
      );
    }

    // ==========================================================
    // 6. EXECUTE STEP
    // ==========================================================

    let stepOutput;

    try {
      if (
        step.type === "llm"
      ) {
        stepOutput =
          await executeLLMStep(
            step,
            stepInput,
            {
              getRemainingTime,
            }
          );
      } else {
        throw new Error(
          `Unsupported step type: ${step.type}`
        );
      }
    } catch (stepError) {
      // ========================================================
      // STEP FAILURE
      // ========================================================

      console.error(
        `Step failed: ${step.name}`,
        stepError
      );

      const errorMessage =
        stepError?.message ||
        "Unknown step error";

      try {
        await failExecution(
          graphqlRequest,

          stepRunId,

          workflowRunId,

          errorMessage
        );
      } catch (dbError) {
        console.error(
          "Could not update failed execution:",
          dbError
        );
      }

      // Return 200 so Hasura doesn't
      // endlessly retry this event.
      return res.status(200).json({
        success: false,

        message:
          `Step execution failed: ${step.name}`,

        error:
          errorMessage,

        workflow_run_id:
          workflowRunId,

        step_run_id:
          stepRunId,
      });
    }

    // ==========================================================
    // 7. NEXT STEP
    // ==========================================================

    if (nextStep) {
      await completeAndCreateNext(
        graphqlRequest,
        {
          stepRunId,

          workflowRunId,

          nextStepId:
            nextStep.id,

          output:
            stepOutput,
        }
      );

      console.log(
        `Completed: ${step.name}`
      );

      console.log(
        `Next step created: ${nextStep.name}`
      );

      return res.status(200).json({
        success: true,

        message:
          "Step completed and next step created",

        workflow_run_id:
          workflowRunId,

        step_run_id:
          stepRunId,

        completed_step:
          step.name,

        next_step:
          nextStep.name,

        next_step_id:
          nextStep.id,

        output:
          stepOutput,

        status:
          "running",
      });
    }

    // ==========================================================
    // 8. FINAL STEP
    // ==========================================================

    await completeWorkflow(
      graphqlRequest,
      {
        stepRunId,

        workflowRunId,

        output:
          stepOutput,
      }
    );

    console.log(
      `Final step completed: ${step.name}`
    );

    console.log(
      `Workflow completed: ${workflowRunId}`
    );

    return res.status(200).json({
      success: true,

      message:
        "Workflow completed successfully",

      workflow_run_id:
        workflowRunId,

      step_run_id:
        stepRunId,

      completed_step:
        step.name,

      output:
        stepOutput,

      status:
        "completed",
    });
  } catch (error) {
    // ==========================================================
    // GLOBAL ERROR
    // ==========================================================

    console.error(
      "Function error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Internal server error",

      error:
        error?.message ||
        "Unknown error",
    });
  }
};