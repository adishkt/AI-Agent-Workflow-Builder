export default async (req, res) => {
  const startTime = Date.now();

  // ============================================================
  // CONFIG
  // ============================================================

  // Nhost Functions are time-limited.
  // Keep enough room for GraphQL + OpenRouter + final DB update.
  const FUNCTION_TIMEOUT = 9000;

  const remainingTime = () => {
    return FUNCTION_TIMEOUT - (Date.now() - startTime);
  };

  // ============================================================
  // GRAPHQL HELPER
  // ============================================================

  const graphqlRequest = async (query, variables = {}) => {
    const remaining = remainingTime();

    if (remaining < 600) {
      throw new Error(
        "Not enough time remaining for GraphQL request"
      );
    }

    const controller = new AbortController();

    const timeoutMs = Math.min(
      1200,
      Math.max(600, remaining - 300)
    );

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(
        process.env.NHOST_GRAPHQL_URL,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "x-hasura-admin-secret":
              process.env.NHOST_ADMIN_SECRET,
          },

          body: JSON.stringify({
            query,
            variables,
          }),

          signal: controller.signal,
        }
      );

      const text = await response.text();

      let result;

      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          `GraphQL returned invalid JSON: ${text.slice(
            0,
            500
          )}`
        );
      }

      if (!response.ok || result.errors) {
        throw new Error(
          result.errors?.[0]?.message ||
            `GraphQL request failed with status ${response.status}`
        );
      }

      return result.data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(
          "GraphQL request timed out"
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  // ============================================================
  // MAIN
  // ============================================================

  try {
    // ============================================================
    // 1. READ HASURA EVENT
    // ============================================================

    const event = req.body?.event;

    const stepRun = event?.data?.new;

    if (!stepRun) {
      return res.status(400).json({
        success: false,
        message:
          "step_run event data is missing",
      });
    }

    const stepRunId = stepRun.id;
    const workflowRunId =
      stepRun.workflow_run_id;
    const workflowStepId =
      stepRun.workflow_step_id;

    // This is the important value for chaining.
    const stepInput = stepRun.input || {};

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

    console.log(
      "Step input:",
      JSON.stringify(stepInput)
    );

    // ============================================================
    // 2. CHECK ENVIRONMENT
    // ============================================================

    if (!process.env.NHOST_GRAPHQL_URL) {
      return res.status(500).json({
        success: false,
        message:
          "NHOST_GRAPHQL_URL is not configured",
      });
    }

    if (!process.env.NHOST_ADMIN_SECRET) {
      return res.status(500).json({
        success: false,
        message:
          "NHOST_ADMIN_SECRET is not configured",
      });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({
        success: false,
        message:
          "OPENROUTER_API_KEY is not configured",
      });
    }

    // ============================================================
    // 3. GET CURRENT WORKFLOW STEP
    // ============================================================
    //
    // IMPORTANT:
    // We do NOT use workflowRunId as workflow_id.
    //
    // workflowRunId -> workflow_runs.id
    // workflowStepId -> workflow_steps.id
    //
    // The current workflow_step contains the real workflow_id
    // and step_order.
    // ============================================================

    const currentStepQuery = `
      query GetCurrentStep(
        $step_id: uuid!
      ) {
        workflow_steps_by_pk(
          id: $step_id
        ) {
          id
          workflow_id
          step_order
          name
          type
          config
        }
      }
    `;

    const currentStepData =
      await graphqlRequest(
        currentStepQuery,
        {
          step_id: workflowStepId,
        }
      );

    const step =
      currentStepData.workflow_steps_by_pk;

    if (!step) {
      throw new Error(
        "Workflow step not found"
      );
    }

    const workflowId = step.workflow_id;

    const currentStepOrder =
      step.step_order;

    console.log(
      `Workflow ID: ${workflowId}`
    );

    console.log(
      `Current step order: ${currentStepOrder}`
    );

    // ============================================================
    // 4. GET NEXT STEP
    // ============================================================

    const nextStepQuery = `
      query GetNextStep(
        $workflow_id: uuid!
        $step_order: Int!
      ) {
        workflow_steps(
          where: {
            workflow_id: {
              _eq: $workflow_id
            }
            step_order: {
              _gt: $step_order
            }
          }

          order_by: {
            step_order: asc
          }

          limit: 1
        ) {
          id
          workflow_id
          step_order
          name
          type
          config
        }
      }
    `;

    const nextStepData =
      await graphqlRequest(
        nextStepQuery,
        {
          workflow_id: workflowId,
          step_order: currentStepOrder,
        }
      );

    const nextStep =
      nextStepData.workflow_steps?.[0] ||
      null;

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

    // ============================================================
    // 5. EXECUTE CURRENT STEP
    // ============================================================

    let stepOutput;

    try {
      // ==========================================================
      // LLM STEP
      // ==========================================================

      if (step.type === "llm") {
        const config = step.config || {};

        const basePrompt =
          config.prompt ??
          config.message ??
          step.name ??
          "Complete this task.";

        const previousOutput =
          stepInput.previous_output;

        let prompt = basePrompt;

        // --------------------------------------------------------
        // STEP-TO-STEP CHAINING
        // --------------------------------------------------------

        if (
          previousOutput !== undefined &&
          previousOutput !== null
        ) {
          prompt += `

Previous step output:
${JSON.stringify(previousOutput)}
`;
        }

        console.log(
          "Previous output:",
          JSON.stringify(previousOutput)
        );

        console.log(
          "Final prompt:",
          prompt
        );

        const model =
          config.model ||
          "openrouter/free";

        console.log(
          `Calling OpenRouter using ${model}`
        );

        // ========================================================
        // OPENROUTER
        // ========================================================

        const remaining =
          remainingTime();

        if (remaining < 1800) {
          throw new Error(
            "Not enough time remaining to call OpenRouter"
          );
        }

        const controller =
          new AbortController();

        const timeoutMs = Math.min(
          4000,
          Math.max(
            1500,
            remaining - 800
          )
        );

        const timeout = setTimeout(
          () => controller.abort(),
          timeoutMs
        );

        let llmResponse;

        try {
          llmResponse = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${process.env.OPENROUTER_API_KEY}`,

                "HTTP-Referer":
                  "https://app.nhost.io",

                "X-Title":
                  "AI Agent Workflow Builder",
              },

              body: JSON.stringify({
                model,

                messages: [
                  {
                    role: "user",
                    content: prompt,
                  },
                ],

                max_tokens:
                  config.max_tokens ||
                  200,
              }),

              signal: controller.signal,
            }
          );
        } catch (error) {
          if (
            error.name ===
            "AbortError"
          ) {
            throw new Error(
              "OpenRouter request timed out"
            );
          }

          throw new Error(
            `Could not connect to OpenRouter: ${error.message}`
          );
        } finally {
          clearTimeout(timeout);
        }

        // ========================================================
        // READ OPENROUTER RESPONSE
        // ========================================================

        const responseText =
          await llmResponse.text();

        let llmResult;

        try {
          llmResult =
            JSON.parse(responseText);
        } catch {
          throw new Error(
            `OpenRouter returned invalid JSON: ${responseText.slice(
              0,
              500
            )}`
          );
        }

        // ========================================================
        // OPENROUTER ERROR
        // ========================================================

        if (!llmResponse.ok) {
          throw new Error(
            llmResult?.error?.message ||
              `OpenRouter request failed with status ${llmResponse.status}`
          );
        }

        // ========================================================
        // EXTRACT OUTPUT
        // ========================================================

        const aiText =
          llmResult
            ?.choices?.[0]
            ?.message?.content;

        if (!aiText) {
          throw new Error(
            "OpenRouter returned no text response"
          );
        }

        stepOutput = {
          text: aiText,

          model:
            llmResult.model ||
            model,
        };

        console.log(
          "LLM step completed"
        );

        console.log(
          "Step output:",
          JSON.stringify(stepOutput)
        );
      }

      // ==========================================================
      // UNSUPPORTED STEP
      // ==========================================================

      else {
        throw new Error(
          `Unsupported step type: ${step.type}`
        );
      }
    } catch (stepError) {
      // ============================================================
      // STEP FAILED
      // ============================================================

      console.error(
        `Step failed: ${step.name}`,
        stepError
      );

      const errorMessage =
        stepError?.message ||
        "Unknown step error";

      try {
        const failMutation = `
          mutation FailExecution(
            $step_id: uuid!
            $workflow_id: uuid!
            $error: String!
          ) {

            update_step_runs_by_pk(
              pk_columns: {
                id: $step_id
              }

              _set: {
                status: "failed"
                error: $error
              }
            ) {
              id
              status
              error
            }

            update_workflow_runs_by_pk(
              pk_columns: {
                id: $workflow_id
              }

              _set: {
                status: "failed"
                error: $error
              }
            ) {
              id
              status
              error
            }
          }
        `;

        await graphqlRequest(
          failMutation,
          {
            step_id: stepRunId,
            workflow_id: workflowRunId,
            error: errorMessage,
          }
        );
      } catch (dbError) {
        console.error(
          "Could not update failed execution:",
          dbError
        );
      }

      // Return 200 so Hasura does not
      // endlessly retry the failed event.
      return res.status(200).json({
        success: false,

        message:
          `Step execution failed: ${step.name}`,

        error: errorMessage,

        workflow_run_id:
          workflowRunId,

        step_run_id:
          stepRunId,
      });
    }

    // ============================================================
    // 6. COMPLETE CURRENT STEP
    //
    //    AND CREATE NEXT STEP
    //
    //    OR COMPLETE WORKFLOW
    // ============================================================

    if (nextStep) {
      // ==========================================================
      // CURRENT STEP + NEXT STEP
      // ==========================================================

      const nextStepMutation = `
        mutation CompleteAndCreateNext(
          $step_id: uuid!
          $next_workflow_run_id: uuid!
          $next_workflow_step_id: uuid!
          $output: jsonb
          $input: jsonb
        ) {

          update_step_runs_by_pk(
            pk_columns: {
              id: $step_id
            }

            _set: {
              status: "completed"
              output: $output
              error: null
            }
          ) {
            id
            status
            output
          }

          insert_step_runs_one(
            object: {
              workflow_run_id:
                $next_workflow_run_id

              workflow_step_id:
                $next_workflow_step_id

              status: "pending"

              input: $input
            }
          ) {
            id
            status
            input
          }
        }
      `;

      const nextInput = {
        previous_output: stepOutput,
      };

      console.log(
        "Creating next step with input:",
        JSON.stringify(nextInput)
      );

      await graphqlRequest(
        nextStepMutation,
        {
          step_id: stepRunId,

          next_workflow_run_id:
            workflowRunId,

          next_workflow_step_id:
            nextStep.id,

          output:
            stepOutput,

          input:
            nextInput,
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

    // ============================================================
    // 7. FINAL STEP
    // ============================================================

    const completeWorkflowMutation = `
      mutation CompleteWorkflow(
        $step_id: uuid!
        $workflow_run_id: uuid!
        $output: jsonb
      ) {

        update_step_runs_by_pk(
          pk_columns: {
            id: $step_id
          }

          _set: {
            status: "completed"
            output: $output
            error: null
          }
        ) {
          id
          status
          output
        }

        update_workflow_runs_by_pk(
          pk_columns: {
            id: $workflow_run_id
          }

          _set: {
            status: "completed"
            error: null
          }
        ) {
          id
          status
        }
      }
    `;

    await graphqlRequest(
      completeWorkflowMutation,
      {
        step_id: stepRunId,

        workflow_run_id:
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

    // ============================================================
    // 8. SUCCESS RESPONSE
    // ============================================================

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
    // ============================================================
    // GLOBAL ERROR
    // ============================================================

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