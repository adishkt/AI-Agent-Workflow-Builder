import {
  createGraphQLClient,
} from "./lib/graphql.js";

import {
  getCurrentStep,
  getNextStep,
  getStepById,
  markStepFailed,
  failExecution,
  createRetryStepRun,
  completeAndCreateNext,
  completeWorkflow,
  pauseApprovalGate,
} from "./lib/workflow.js";

import {
  executeLLMStep,
} from "./lib/llm.js";

import {
  executeHttpStep,
} from "./lib/http.js";

import {
  executeConditionalStep,
} from "./lib/condition.js";

import {
  executeDbWriteStep,
} from "./lib/db.js";

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


    // ========================================================
    // VALIDATE EVENT
    // ========================================================

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
      "EXECUTING WORKFLOW STEP"
    );

    console.log(
      "Step run:",
      stepRunId
    );

    console.log(
      "Workflow run:",
      workflowRunId
    );

    console.log(
      "Workflow step:",
      workflowStepId
    );

    console.log(
      "Attempt:",
      currentAttempt
    );

    console.log(
      "Input:",
      JSON.stringify(
        stepInput
      )
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


    if (!step) {

      throw new Error(
        "Workflow step could not be loaded"
      );

    }


    // ========================================================
    // VERIFY WORKFLOW
    // ========================================================

    if (
      step.workflow_id !==
      workflowRunId &&
      !step.workflow_id
    ) {

      throw new Error(
        "Workflow step does not belong to a workflow"
      );

    }


    console.log(
      "Workflow ID:",
      step.workflow_id
    );

    console.log(
      "Step name:",
      step.name
    );

    console.log(
      "Step type:",
      step.type
    );

    console.log(
      "Step order:",
      step.step_order
    );


    // ========================================================
    // 5. APPROVAL GATE
    // ========================================================
    //
    // Approval steps pause the workflow.
    //
    // IMPORTANT:
    //
    // We return immediately here.
    //
    // approveStep later creates the next pending
    // step_run, which triggers this function again.
    //
    // ========================================================

    if (
      step.type ===
      "approval_gate"
    ) {

      const message =
        step.config?.message ||
        "Approval required to continue this workflow.";


      await pauseApprovalGate(
        graphqlRequest,
        {
          stepRunId,

          workflowRunId,

          message,
        }
      );


      console.log(
        "========================================"
      );

      console.log(
        "WORKFLOW PAUSED"
      );

      console.log(
        "Approval step:",
        step.name
      );

      console.log(
        "Step run:",
        stepRunId
      );

      console.log(
        "========================================"
      );


      return res.status(200).json({

        success: true,

        message:
          "Workflow paused awaiting approval",

        workflow_run_id:
          workflowRunId,

        step_run_id:
          stepRunId,

        step:
          step.name,

        status:
          "paused",

        approval_required:
          true,
      });

    }


    // ========================================================
    // 6. EXECUTE CURRENT STEP
    // ========================================================

    let stepOutput;


    try {

      // ======================================================
      // LLM
      // ======================================================

      if (
        step.type ===
        "llm"
      ) {

        if (
          !process.env.OPENROUTER_API_KEY
        ) {

          throw new Error(
            "OPENROUTER_API_KEY is not configured"
          );

        }


        stepOutput =
          await executeLLMStep(
            step,

            stepInput,

            {
              getRemainingTime,
            }
          );

      }


      // ======================================================
      // HTTP REQUEST
      // ======================================================

      else if (
        step.type ===
        "http_request"
      ) {

        stepOutput =
          await executeHttpStep(
            step,

            stepInput,

            {
              getRemainingTime,
            }
          );

      }


      // ======================================================
      // DATABASE WRITE
      // ======================================================

      else if (
        step.type ===
        "db_write"
      ) {

        stepOutput =
          await executeDbWriteStep(
            graphqlRequest,

            stepRunId,

            stepInput
          );

      }


      // ======================================================
      // CONDITIONAL BRANCH
      // ======================================================

      else if (
        step.type ===
        "conditional_branch"
      ) {

        stepOutput =
          executeConditionalStep(
            step,

            stepInput
          );


        console.log(
          "========================================"
        );

        console.log(
          "CONDITIONAL BRANCH"
        );

        console.log(
          "Actual:",
          stepOutput.actual
        );

        console.log(
          "Expected:",
          stepOutput.expected
        );

        console.log(
          "Operator:",
          stepOutput.operator
        );

        console.log(
          "Result:",
          stepOutput.result
        );

        console.log(
          "TRUE step:",
          stepOutput.true_step_id
        );

        console.log(
          "FALSE step:",
          stepOutput.false_step_id
        );

        console.log(
          "SELECTED step:",
          stepOutput.selected_step_id
        );

        console.log(
          "========================================"
        );

      }


      // ======================================================
      // UNSUPPORTED STEP
      // ======================================================

      else {

        throw new Error(
          `Unsupported step type: ${step.type}`
        );

      }


    } catch (
      stepError
    ) {

      // ======================================================
      // STEP FAILED
      // ======================================================

      console.error(
        "========================================"
      );

      console.error(
        "STEP FAILED"
      );

      console.error(
        "Step:",
        step.name
      );

      console.error(
        "Step run:",
        stepRunId
      );

      console.error(
        "Error:",
        stepError
      );

      console.error(
        "========================================"
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

          // --------------------------------------------------
          // Mark current step failed
          // --------------------------------------------------

          await markStepFailed(
            graphqlRequest,

            stepRunId,

            errorMessage,

            currentAttempt
          );


          // --------------------------------------------------
          // Preserve input
          // --------------------------------------------------

          const retryInput =
            getRetryInput(
              stepInput
            );


          // --------------------------------------------------
          // Create retry step run
          // --------------------------------------------------

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
            "Retry step_run created:",
            retryStepRun?.id
          );


          // --------------------------------------------------
          // IMPORTANT
          //
          // The new step_run has status "pending".
          //
          // Hasura Event Trigger should execute this
          // function again.
          // --------------------------------------------------

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

        } catch (
          retryError
        ) {

          console.error(
            "Could not create retry:",
            retryError
          );


          try {

            await failExecution(
              graphqlRequest,

              stepRunId,

              workflowRunId,

              retryError?.message ||
                errorMessage,

              currentAttempt
            );

          } catch (
            dbError
          ) {

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

      } catch (
        dbError
      ) {

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
    // 7. VALIDATE STEP OUTPUT
    // ========================================================

    if (
      stepOutput ===
      undefined
    ) {

      throw new Error(
        `Step "${step.name}" returned no output`
      );

    }


    console.log(
      "Step output:",
      JSON.stringify(
        stepOutput
      )
    );


    // ========================================================
    // 8. CONDITIONAL BRANCH
    //
    // IMPORTANT:
    //
    // A conditional step must ONLY execute the selected
    // branch.
    //
    // It must NOT call getNextStep().
    //
    // ========================================================

    if (
      step.type ===
      "conditional_branch"
    ) {

      const selectedStepId =
        stepOutput.selected_step_id;


      if (!selectedStepId) {

        throw new Error(
          `Conditional branch "${step.name}" does not define the selected next step`
        );

      }


      console.log(
        "Conditional selected step:",
        selectedStepId
      );


      // ------------------------------------------------------
      // Load selected branch
      // ------------------------------------------------------

      const nextStep =
        await getStepById(
          graphqlRequest,

          selectedStepId
        );


      if (!nextStep) {

        throw new Error(
          `Selected conditional step ${selectedStepId} could not be found`
        );

      }


      // ------------------------------------------------------
      // Security
      //
      // Branch cannot jump to another workflow.
      // ------------------------------------------------------

      if (
        nextStep.workflow_id !==
        step.workflow_id
      ) {

        throw new Error(
          "Conditional branch cannot jump to a step in another workflow"
        );

      }


      console.log(
        `Conditional branch selected: ${nextStep.name}`
      );


      // ------------------------------------------------------
      // Create selected branch only
      // ------------------------------------------------------

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
        `Completed conditional step: ${step.name}`
      );

      console.log(
        `Selected branch created: ${nextStep.name}`
      );


      return res.status(200).json({

        success: true,

        message:
          "Conditional step completed and selected branch created",

        workflow_run_id:
          workflowRunId,

        step_run_id:
          stepRunId,

        completed_step:
          step.name,

        condition_result:
          stepOutput.result,

        selected_step:
          nextStep.name,

        selected_step_id:
          nextStep.id,

        output:
          stepOutput,

        status:
          "running",
      });

    }


    // ========================================================
    // 9. NORMAL STEP → NEXT STEP
    //
    // This handles:
    //
    // - llm
    // - http_request
    // - db_write
    //
    // Approval gates were already handled above.
    // Conditional branches were already handled above.
    // ========================================================

    const nextStep =
      await getNextStep(
        graphqlRequest,

        step.workflow_id,

        step.step_order
      );


    if (nextStep) {

      console.log(
        "========================================"
      );

      console.log(
        "NORMAL WORKFLOW PROGRESSION"
      );

      console.log(
        "Current step:",
        step.name
      );

      console.log(
        "Next step:",
        nextStep.name
      );

      console.log(
        "Next step type:",
        nextStep.type
      );

      console.log(
        "========================================"
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


      // ------------------------------------------------------
      // IMPORTANT
      //
      // completeAndCreateNext creates the next step_run
      // with status "pending".
      //
      // Your Hasura Event Trigger should then invoke
      // executeWorkflowStep again.
      // ------------------------------------------------------

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
    // 10. FINAL STEP
    // ========================================================
    //
    // No next step means this was the final step.
    //
    // Complete:
    //
    // 1. step_run
    // 2. workflow_run
    // 3. organization quota
    //
    // ========================================================

    const organizationId =
      step.workflow?.organization?.id;


    if (!organizationId) {

      throw new Error(
        "Organization ID could not be resolved for final workflow step"
      );

    }


    await completeWorkflow(
      graphqlRequest,
      {
        stepRunId,

        workflowRunId,

        output:
          stepOutput,

        organizationId,
      }
    );


    console.log(
      "========================================"
    );

    console.log(
      "WORKFLOW COMPLETED"
    );

    console.log(
      "Workflow run:",
      workflowRunId
    );

    console.log(
      "Final step:",
      step.name
    );

    console.log(
      "Organization:",
      organizationId
    );

    console.log(
      "Quota incremented"
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


  } catch (
    error
  ) {

    // ========================================================
    // GLOBAL FUNCTION ERROR
    // ========================================================

    console.error(
      "========================================"
    );

    console.error(
      "EXECUTE WORKFLOW STEP ERROR"
    );

    console.error(
      error
    );

    console.error(
      "========================================"
    );


    return res.status(500).json({

      success: false,

      message:
        error?.message ||
        "Internal server error",

      error:
        error?.message ||
        "Unknown error",
    });

  }

};