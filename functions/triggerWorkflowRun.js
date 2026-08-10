export default async (req, res) => {
  try {
    // --------------------------------------------------
    // 0. CORS
    // --------------------------------------------------

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "origin,Accept,Authorization,Content-Type"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST,OPTIONS"
    );

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    // --------------------------------------------------
    // 1. Get workflow ID
    // --------------------------------------------------

    const workflowId = req.body?.input?.workflow_id;

    if (!workflowId) {
      return res.status(400).json({
        success: false,
        message: "workflow_id is required",
        workflow_id: null,
      });
    }

    // --------------------------------------------------
    // 2. Validate environment variables
    // --------------------------------------------------

    if (!process.env.NHOST_GRAPHQL_URL) {
      return res.status(500).json({
        success: false,
        message: "NHOST_GRAPHQL_URL is not configured",
        workflow_id: workflowId,
      });
    }

    if (!process.env.NHOST_ADMIN_SECRET) {
      return res.status(500).json({
        success: false,
        message: "NHOST_ADMIN_SECRET is not configured",
        workflow_id: workflowId,
      });
    }

    // --------------------------------------------------
    // Helper: GraphQL request
    // --------------------------------------------------

    const graphqlRequest = async (query, variables = {}) => {
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
    };

    // --------------------------------------------------
    // Helper: fetch with timeout
    // --------------------------------------------------

    const fetchWithTimeout = async (
      url,
      options = {},
      timeoutMs = 7000
    ) => {
      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        return await fetch(url, {
          ...options,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    };

    // --------------------------------------------------
    // 3. Get workflow steps
    // --------------------------------------------------

    const stepsQuery = `
      query GetWorkflowSteps($workflow_id: uuid!) {
        workflow_steps(
          where: {
            workflow_id: {
              _eq: $workflow_id
            }
          }
          order_by: {
            step_order: asc
          }
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

    let stepsResult;

    try {
      const data = await graphqlRequest(
        stepsQuery,
        {
          workflow_id: workflowId,
        }
      );

      stepsResult = data;
    } catch (error) {
      console.error(
        "Failed to fetch workflow steps:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch workflow steps",
        error: error.message,
        workflow_id: workflowId,
      });
    }

    const steps = stepsResult.workflow_steps || [];

    // --------------------------------------------------
    // 4. Check workflow steps
    // --------------------------------------------------

    if (steps.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Workflow has no steps",
        workflow_id: workflowId,
      });
    }

    console.log(
      `Found ${steps.length} step(s) for workflow ${workflowId}`
    );

    // --------------------------------------------------
    // 5. Create workflow run
    // --------------------------------------------------

    const createRunMutation = `
      mutation CreateWorkflowRun(
        $workflow_id: uuid!
      ) {
        insert_workflow_runs_one(
          object: {
            workflow_id: $workflow_id
            status: "pending"
          }
        ) {
          id
          workflow_id
          status
          started_at
          completed_at
          error
        }
      }
    `;

    let run;

    try {
      const data = await graphqlRequest(
        createRunMutation,
        {
          workflow_id: workflowId,
        }
      );

      run = data.insert_workflow_runs_one;
    } catch (error) {
      console.error(
        "Failed to create workflow run:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to create workflow run",
        error: error.message,
        workflow_id: workflowId,
      });
    }

    const runId = run.id;

    console.log(
      `Created workflow_run ${runId}`
    );

    // --------------------------------------------------
    // 6. Mark workflow run as running
    // --------------------------------------------------

    const startRunMutation = `
      mutation StartWorkflowRun(
        $id: uuid!
      ) {
        update_workflow_runs_by_pk(
          pk_columns: {
            id: $id
          }
          _set: {
            status: "running"
          }
        ) {
          id
          status
          started_at
        }
      }
    `;

    try {
      await graphqlRequest(
        startRunMutation,
        {
          id: runId,
        }
      );
    } catch (error) {
      console.error(
        "Failed to start workflow run:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to start workflow run",
        error: error.message,
        workflow_id: workflowId,
        run_id: runId,
      });
    }

    // --------------------------------------------------
    // 7. Execute every workflow step
    // --------------------------------------------------

    for (const step of steps) {
      console.log(
        `Starting step: ${step.name}`
      );

      // ------------------------------------------------
      // Create step_run
      // ------------------------------------------------

      const createStepRunMutation = `
        mutation CreateStepRun(
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
            input
          }
        }
      `;

      const stepInput = {
        step_name: step.name,
        step_type: step.type,
        config: step.config,
      };

      let stepRun;

      try {
        const data = await graphqlRequest(
          createStepRunMutation,
          {
            workflow_run_id: runId,
            workflow_step_id: step.id,
            input: stepInput,
          }
        );

        stepRun = data.insert_step_runs_one;
      } catch (error) {
        console.error(
          "Failed to create step_run:",
          error
        );

        throw new Error(
          `Failed to create step_run for ${step.name}: ${error.message}`
        );
      }

      const stepRunId = stepRun.id;

      console.log(
        `Created step_run ${stepRunId} for step ${step.name}`
      );

      // ------------------------------------------------
      // Mark step as running
      // ------------------------------------------------

      const startStepRunMutation = `
        mutation StartStepRun(
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

      try {
        await graphqlRequest(
          startStepRunMutation,
          {
            id: stepRunId,
          }
        );
      } catch (error) {
        console.error(
          "Failed to start step_run:",
          error
        );

        throw new Error(
          `Failed to start step ${step.name}: ${error.message}`
        );
      }

      // ------------------------------------------------
      // Execute step
      // ------------------------------------------------

      try {
        let stepOutput;

        // ==============================================
        // LLM STEP
        // ==============================================

        if (step.type === "llm") {
          const config = step.config || {};

          const prompt =
            config.prompt ??
            config.message ??
            step.name;

          const model =
            config.model ??
            "openrouter/free";

          console.log(
            "======================================"
          );

          console.log(
            `Executing LLM step: ${step.name}`
          );

          console.log(
            `OpenRouter model: ${model}`
          );

          console.log(
            `Prompt: ${prompt}`
          );

          console.log(
            "OpenRouter API key configured:",
            Boolean(
              process.env.OPENROUTER_API_KEY
            )
          );

          console.log(
            "======================================"
          );

          // --------------------------------------------
          // Check API key
          // --------------------------------------------

          if (!process.env.OPENROUTER_API_KEY) {
            throw new Error(
              "OPENROUTER_API_KEY is not configured"
            );
          }

          // --------------------------------------------
          // Call OpenRouter
          // --------------------------------------------

          let llmResponse;

          try {
            llmResponse =
              await fetchWithTimeout(
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
                  }),
                },

                7000
              );
          } catch (error) {
            if (
              error.name === "AbortError"
            ) {
              throw new Error(
                "OpenRouter request timed out after 7 seconds"
              );
            }

            throw new Error(
              `Could not connect to OpenRouter: ${error.message}`
            );
          }

          // --------------------------------------------
          // Read response
          // --------------------------------------------

          const responseText =
            await llmResponse.text();

          let llmResult;

          try {
            llmResult =
              JSON.parse(responseText);
          } catch {
            throw new Error(
              `OpenRouter returned invalid JSON: ${responseText}`
            );
          }

          console.log(
            "OpenRouter status:",
            llmResponse.status
          );

          console.log(
            "OpenRouter response:",
            JSON.stringify(llmResult)
          );

          // --------------------------------------------
          // Check response
          // --------------------------------------------

          if (!llmResponse.ok) {
            throw new Error(
              llmResult?.error?.message ||
                `OpenRouter request failed with status ${llmResponse.status}`
            );
          }

          const aiText =
            llmResult?.choices?.[0]?.message?.content;

          if (!aiText) {
            throw new Error(
              "OpenRouter returned no text response"
            );
          }

          console.log(
            `LLM response received for step ${step.name}`
          );

          stepOutput = {
            text: aiText,
            model:
              llmResult.model || model,
          };
        }

        // ==============================================
        // UNSUPPORTED STEP TYPE
        // ==============================================

        else {
          throw new Error(
            `Unsupported step type: ${step.type}`
          );
        }

        // ------------------------------------------------
        // Save successful step output
        // ------------------------------------------------

        const completeStepRunMutation = `
          mutation CompleteStepRun(
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

        try {
          await graphqlRequest(
            completeStepRunMutation,
            {
              id: stepRunId,
              output: stepOutput,
            }
          );
        } catch (error) {
          throw new Error(
            `Failed to save output for ${step.name}: ${error.message}`
          );
        }

        console.log(
          `Completed step: ${step.name}`
        );
      } catch (stepError) {
        // ----------------------------------------------
        // Step failed
        // ----------------------------------------------

        console.error(
          `Step execution failed for ${step.name}:`,
          stepError
        );

        const errorMessage =
          stepError?.message ||
          "Unknown step error";

        // ----------------------------------------------
        // Save step failure
        // ----------------------------------------------

        const failStepRunMutation = `
          mutation FailStepRun(
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

        try {
          await graphqlRequest(
            failStepRunMutation,
            {
              id: stepRunId,
              error: errorMessage,
            }
          );
        } catch (error) {
          console.error(
            "Failed to save step failure:",
            error
          );
        }

        // ----------------------------------------------
        // Mark workflow as failed
        // ----------------------------------------------

        const failWorkflowMutation = `
          mutation FailWorkflowRun(
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
              error
              completed_at
            }
          }
        `;

        try {
          await graphqlRequest(
            failWorkflowMutation,
            {
              id: runId,
              error: errorMessage,
            }
          );
        } catch (error) {
          console.error(
            "Failed to update workflow failure:",
            error
          );
        }

        // IMPORTANT:
        // Return 200 so Hasura Action gets a valid response.
        return res.status(200).json({
          success: false,
          message:
            `Step execution failed: ${step.name}`,
          error: errorMessage,
          workflow_id: workflowId,
          run_id: runId,
        });
      }
    }

    // --------------------------------------------------
    // 8. All steps completed
    // --------------------------------------------------

    const completeWorkflowMutation = `
      mutation CompleteWorkflowRun(
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

    try {
      await graphqlRequest(
        completeWorkflowMutation,
        {
          id: runId,
        }
      );
    } catch (error) {
      console.error(
        "Failed to complete workflow run:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Workflow completed but status update failed",
        error: error.message,
        workflow_id: workflowId,
        run_id: runId,
      });
    }

    // --------------------------------------------------
    // 9. Final response
    // --------------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        "Workflow completed successfully",
      workflow_id: workflowId,
      run_id: runId,
      status: "completed",
      step_count: steps.length,
    });
  } catch (error) {
    // --------------------------------------------------
    // Unexpected function error
    // --------------------------------------------------

    console.error(
      "Function error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message || "Unknown error",
      workflow_id: null,
    });
  }
};