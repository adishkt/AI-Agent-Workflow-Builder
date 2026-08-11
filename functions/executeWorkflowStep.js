import {
  createGraphQLClient,
} from "./lib/graphql.js";

import {
  getCurrentStep,
  getNextStep,
  markStepFailed,
  failExecution,
  createRetryStepRun,
  completeAndCreateNext,
  completeWorkflow,
} from "./lib/workflow.js";

import {
  executeLLMStep,
} from "./lib/llm.js";

import {
  shouldRetry,
  getNextAttempt,
  getMaxAttempts,
  getRetryInput,
} from "./lib/retry.js";

export default async (
  req,
  res
) => {
  // ==========================================================
  // FUNCTION TIME
  // ==========================================================

  const startTime =
    Date.now();

  const FUNCTION_TIMEOUT =
    9000;

  const getRemainingTime =
    () =>
      FUNCTION_TIMEOUT -
      (Date.now() - startTime);

  try {
    // ========================================================
    // 1. READ HASURA EVENT
    // ========================================================

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

    const currentAttempt =
      Number(
        stepRun.attempt_count || 0
      );

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
      "========================================"
    );

    console.log(
      `Executing step: ${workflowStepId}`
    );

    console.log(
      `Workflow run: ${workflowRunId}`
    );

    console.log(
      `Attempt count: ${currentAttempt}`
    );

    // ========================================================
    // 2. CHECK ENVIRONMENT
    // ========================================================

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

    // ========================================================
    // 3. GRAPHQL CLIENT
    // ========================================================

    const graphqlRequest =
      createGraphQLClient({
        getRemainingTime,
      });

    // ========================================================
    // 4. GET CURRENT WORKFLOW STEP
    // ========================================================

    const step =
      await getCurrentStep(
        graphqlRequest,
        workflowStepId
      );

    console.log(
      `Workflow ID: ${step.workflow_id}`
    );

    console.log(
      `Step name: ${step.name}`
    );

    console.log(
      `Step type: ${step.type}`
    );

    console.log(
      `Step order: ${step.step_order}`
    );

    // ========================================================
    // 5. GET NEXT STEP
    // ========================================================

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

      console.log(
        `Next step order: ${nextStep.step_order}`
      );
    } else {
      console.log(
        "This is the final workflow step"
      );
    }

    // ========================================================
    // 6. EXECUTE CURRENT STEP
    // ========================================================

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
      // ======================================================
      // STEP FAILED
      // ======================================================

      console.error(
        `Step failed: ${step.name}`
      );

      console.error(
        "Error:",
        stepError
      );

      const errorMessage =
        stepError?.message ||
        "Unknown step error";

      const maxAttempts =
        getMaxAttempts();

      // ======================================================
      // RETRY AVAILABLE
      // ======================================================

      if (
        shouldRetry(
          currentAttempt
        )
      ) {
        const nextAttempt =
          getNextAttempt(
            currentAttempt
          );

        console.log(
          `Retry available: ${nextAttempt + 1}/${maxAttempts}`
        );

        try {
          // ----------------------------------------------
          // Mark ONLY this step as failed.
          //
          // IMPORTANT:
          // The workflow remains running because
          // another retry will be created.
          // ----------------------------------------------

          await markStepFailed(
            graphqlRequest,

            stepRunId,

            errorMessage,

            currentAttempt
          );

          // ----------------------------------------------
          // Preserve the original input.
          //
          // This means previous_output is not lost.
          // ----------------------------------------------

          const retryInput =
            getRetryInput(
              stepInput
            );

          // ----------------------------------------------
          // Create NEW step_run.
          //
          // Hasura INSERT trigger will execute it.
          // ----------------------------------------------

          const retryStepRun =
            await createRetryStepRun(
              graphqlRequest,
              {
                workflowRunId,

                workflowStepId,

                attemptCount:
                  nextAttempt,

                input:
                  retryInput,
              }
            );

          console.log(
            "Retry step_run created:"
          );

          console.log(
            JSON.stringify(
              retryStepRun
            )
          );

          return res.status(200).json({
            success: true,

            message:
              "Step failed and retry was created",

            status:
              "retrying",

            workflow_run_id:
              workflowRunId,

            failed_step_run_id:
              stepRunId,

            retry_step_run_id:
              retryStepRun?.id,

            attempt:
              nextAttempt + 1,

            max_attempts:
              maxAttempts,

            error:
              errorMessage,
          });
        } catch (retryError) {
          // ==============================================
          // RETRY CREATION FAILED
          // ==============================================

          console.error(
            "Could not create retry:",
            retryError
          );

          // If we cannot create the retry,
          // the workflow should be failed because
          // execution cannot continue safely.

          try {
            await failExecution(
              graphqlRequest,

              stepRunId,

              workflowRunId,

              retryError?.message ||
                errorMessage,

              currentAttempt
            );
          } catch (dbError) {
            console.error(
              "Could not mark workflow failed:",
              dbError
            );
          }

          return res.status(200).json({
            success: false,

            message:
              "Step failed and retry could not be created",

            error:
              retryError?.message ||
              errorMessage,

            workflow_run_id:
              workflowRunId,

            step_run_id:
              stepRunId,

            status:
              "failed",
          });
        }
      }

      // ======================================================
      // NO RETRIES LEFT
      // ======================================================

      console.error(
        `No retries remaining for ${step.name}`
      );

      try {
        await failExecution(
          graphqlRequest,

          stepRunId,

          workflowRunId,

          errorMessage,

          currentAttempt
        );
      } catch (dbError) {
        console.error(
          "Could not update final failure:",
          dbError
        );
      }

      return res.status(200).json({
        success: false,

        message:
          `Step execution failed after ${maxAttempts} attempts`,

        error:
          errorMessage,

        workflow_run_id:
          workflowRunId,

        step_run_id:
          stepRunId,

        attempts:
          currentAttempt + 1,

        max_attempts:
          maxAttempts,

        status:
          "failed",
      });
    }

    // ========================================================
    // 7. CURRENT STEP COMPLETED
    // ========================================================

    if (nextStep) {
      // ======================================================
      // CREATE NEXT STEP
      // ======================================================

      const nextStepInput = {
        previous_output:
          stepOutput,
      };

      console.log(
        "Creating next step with input:"
      );

      console.log(
        JSON.stringify(
          nextStepInput
        )
      );

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

    // ========================================================
    // 8. FINAL STEP
    // ========================================================

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

    console.log(
      "========================================"
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
    // ========================================================
    // GLOBAL FUNCTION ERROR
    // ========================================================

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