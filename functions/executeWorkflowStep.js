export default async (req, res) => {
  const startTime = Date.now();

  // ============================================================
  // HELPERS
  // ============================================================

  const remainingTime = () => {
    return 9000 - (Date.now() - startTime);
  };

  const graphqlRequest = async (query, variables = {}) => {
    const controller = new AbortController();

    // Never allow GraphQL itself to consume the whole
    // Nhost Function execution window.
    const timeoutMs = Math.max(
      1000,
      Math.min(2500, remainingTime() - 500)
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
          `GraphQL returned invalid JSON: ${text}`
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
  // 1. VALIDATE EVENT
  // ============================================================

  try {
    const event = req.body?.event;
    const stepRun = event?.data?.new;

    if (!stepRun) {
      return res.status(400).json({
        success: false,
        message: "step_run event data is missing",
      });
    }

    const stepRunId = stepRun.id;
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
        message: "Invalid step_run event data",
      });
    }

    console.log(
      `Starting step ${workflowStepId}`
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
    // 3. GET CURRENT STEP + NEXT STEP
    //    ONE GRAPHQL REQUEST
    // ============================================================

    const stepQuery = `
      query GetWorkflowStepAndNext(
        $step_id: uuid!
        $workflow_id: uuid!
        $step_order: Int!
      ) {
        current_step: workflow_steps_by_pk(
          id: $step_id
        ) {
          id
          workflow_id
          step_order
          name
          type
          config
        }

        next_steps: workflow_steps(
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

    const stepData =
      await graphqlRequest(
        stepQuery,
        {
          step_id: workflowStepId,
          workflow_id: workflowRunId,
          step_order:
            stepRun.step_order || 0,
        }
      );

    const step =
      stepData.current_step;

    const nextStep =
      stepData.next_steps?.[0] || null;

    if (!step) {
      throw new Error(
        "Workflow step not found"
      );
    }

    console.log(
      `Executing: ${step.name} (${step.type})`
    );

    // ============================================================
    // 4. MARK STEP AS RUNNING
    // ============================================================

    const startMutation = `
      mutation StartStep(
        $id: uuid!
      ) {
        update_step_runs_by_pk(
          pk_columns: {
            id: $id
          }
          _set: {
            status: "running"
          }
        ) {
          id
          status
        }
      }
    `;

    await graphqlRequest(
      startMutation,
      {
        id: stepRunId,
      }
    );

    // ============================================================
    // 5. EXECUTE STEP
    // ============================================================

    let stepOutput;

    try {
      // ----------------------------------------------------------
      // LLM STEP
      // ----------------------------------------------------------

      if (step.type === "llm") {
        const config =
          step.config || {};

        const basePrompt =
          config.prompt ??
          config.message ??
          step.name ??
          "Complete this task.";

        const previousOutput =
          stepInput.previous_output;

        let prompt = basePrompt;

        if (previousOutput) {
          prompt += `

Previous step output:
${JSON.stringify(previousOutput)}
`;
        }

        // Use model configured in the workflow.
        // Otherwise use OpenRouter's free router.
        const model =
          config.model ||
          "openrouter/free";

        console.log(
          `Calling OpenRouter using ${model}`
        );

        // --------------------------------------------------------
        // OPENROUTER TIMEOUT
        // --------------------------------------------------------

        const controller =
          new AbortController();

        const timeoutMs = Math.min(
          4000,
          Math.max(
            1000,
            remainingTime() - 1500
          )
        );

        const timeout = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        let llmResponse;

        try {
          llmResponse =
            await fetch(
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

                  // Keep responses small and fast.
                  max_tokens:
                    config.max_tokens || 300,
                }),

                signal:
                  controller.signal,
              }
            );
        } catch (error) {
          if (
            error.name ===
            "AbortError"
          ) {
            throw new Error(
              "OpenRouter request timed out. Try a faster free model."
            );
          }

          throw new Error(
            `Could not connect to OpenRouter: ${error.message}`
          );
        } finally {
          clearTimeout(timeout);
        }

        // --------------------------------------------------------
        // READ RESPONSE
        // --------------------------------------------------------

        const responseText =
          await llmResponse.text();

        let llmResult;

        try {
          llmResult =
            JSON.parse(
              responseText
            );
        } catch {
          throw new Error(
            `OpenRouter returned invalid JSON: ${responseText.slice(
              0,
              500
            )}`
          );
        }

        if (!llmResponse.ok) {
          throw new Error(
            llmResult?.error?.message ||
              `OpenRouter request failed with status ${llmResponse.status}`
          );
        }

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
      }

      // ----------------------------------------------------------
      // OTHER STEP TYPES
      // ----------------------------------------------------------

      else {
        throw new Error(
          `Unsupported step type: ${step.type}`
        );
      }
    } catch (stepError) {
      console.error(
        `Step failed: ${step.name}`,
        stepError
      );

      const errorMessage =
        stepError?.message ||
        "Unknown step error";

      // ==========================================================
      // MARK STEP FAILED
      // ==========================================================

      try {
        const failStepMutation = `
          mutation FailStep(
            $id: uuid!
            $error: String!
          ) {
            update_step_runs_by_pk(
              pk_columns: {
                id: $id
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
          failStepMutation,
          {
            id: stepRunId,
            error: errorMessage,
          }
        );
      } catch (dbError) {
        console.error(
          "Could not update failed step:",
          dbError
        );
      }

      // ==========================================================
      // MARK WORKFLOW FAILED
      // ==========================================================

      try {
        const failWorkflowMutation = `
          mutation FailWorkflow(
            $id: uuid!
            $error: String!
          ) {
            update_workflow_runs_by_pk(
              pk_columns: {
                id: $id
              }
              _set: {
                status: "failed"
                error: $error
              }
            ) {
              id
              status
            }
          }
        `;

        await graphqlRequest(
          failWorkflowMutation,
          {
            id: workflowRunId,
            error: errorMessage,
          }
        );
      } catch (dbError) {
        console.error(
          "Could not update failed workflow:",
          dbError
        );
      }

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
    // ============================================================

    const completeStepMutation = `
      mutation CompleteStep(
        $id: uuid!
        $output: jsonb
      ) {
        update_step_runs_by_pk(
          pk_columns: {
            id: $id
          }
          _set: {
            status: "completed"
            output: $output
          }
        ) {
          id
          status
          output
        }
      }
    `;

    await graphqlRequest(
      completeStepMutation,
      {
        id: stepRunId,
        output: stepOutput,
      }
    );

    console.log(
      `Completed: ${step.name}`
    );

    // ============================================================
    // 7. CREATE NEXT STEP
    // ============================================================

    if (nextStep) {
      const createNextStepMutation = `
        mutation CreateNextStep(
          $workflow_run_id: uuid!
          $workflow_step_id: uuid!
          $input: jsonb
        ) {
          insert_step_runs_one(
            object: {
              workflow_run_id: $workflow_run_id
              workflow_step_id: $workflow_step_id
              status: "pending"
              input: $input
            }
          ) {
            id
            status
          }
        }
      `;

      await graphqlRequest(
        createNextStepMutation,
        {
          workflow_run_id:
            workflowRunId,

          workflow_step_id:
            nextStep.id,

          input: {
            previous_output:
              stepOutput,
          },
        }
      );

      console.log(
        `Next step created: ${nextStep.name}`
      );

      return res.status(200).json({
        success: true,
        message:
          "Step completed and next step started",

        workflow_run_id:
          workflowRunId,

        step_run_id:
          stepRunId,

        completed_step:
          step.name,

        next_step:
          nextStep.name,

        duration_ms:
          Date.now() - startTime,
      });
    }

    // ============================================================
    // 8. NO NEXT STEP → COMPLETE WORKFLOW
    // ============================================================

    const completeWorkflowMutation = `
      mutation CompleteWorkflow(
        $id: uuid!
      ) {
        update_workflow_runs_by_pk(
          pk_columns: {
            id: $id
          }
          _set: {
            status: "completed"
          }
        ) {
          id
          status
          completed_at
        }
      }
    `;

    await graphqlRequest(
      completeWorkflowMutation,
      {
        id: workflowRunId,
      }
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

      completed_step:
        step.name,

      status:
        "completed",

      duration_ms:
        Date.now() - startTime,
    });
  } catch (error) {
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

      duration_ms:
        Date.now() - startTime,
    });
  }
};