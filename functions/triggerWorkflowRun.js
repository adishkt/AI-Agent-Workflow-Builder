export default async (req, res) => {
  try {
    // --------------------------------------------------
    // 1. Get workflow ID from Hasura Action input
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
    // 2. Get workflow steps
    // --------------------------------------------------

    const stepsQuery = `
      query GetWorkflowSteps($workflow_id: uuid!) {
        workflow_steps(
          where: { workflow_id: { _eq: $workflow_id } }
          order_by: { step_order: asc }
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

    const stepsResponse = await fetch(
      process.env.NHOST_GRAPHQL_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret":
            process.env.NHOST_ADMIN_SECRET,
        },
        body: JSON.stringify({
          query: stepsQuery,
          variables: {
            workflow_id: workflowId,
          },
        }),
      }
    );

    const stepsResult = await stepsResponse.json();

    if (!stepsResponse.ok || stepsResult.errors) {
      console.error(
        "Failed to fetch workflow steps:",
        stepsResult.errors
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch workflow steps",
        workflow_id: workflowId,
      });
    }

    const steps = stepsResult.data.workflow_steps;

    // --------------------------------------------------
    // 3. Check if workflow has steps
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
    // 4. Create workflow run
    // --------------------------------------------------

    const createRunMutation = `
      mutation CreateWorkflowRun($workflow_id: uuid!) {
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

    const createRunResponse = await fetch(
      process.env.NHOST_GRAPHQL_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret":
            process.env.NHOST_ADMIN_SECRET,
        },
        body: JSON.stringify({
          query: createRunMutation,
          variables: {
            workflow_id: workflowId,
          },
        }),
      }
    );

    const createRunResult =
      await createRunResponse.json();

    if (
      !createRunResponse.ok ||
      createRunResult.errors
    ) {
      console.error(
        "Failed to create workflow run:",
        createRunResult.errors
      );

      return res.status(500).json({
        success: false,
        message: "Failed to create workflow run",
        workflow_id: workflowId,
      });
    }

    const run =
      createRunResult.data.insert_workflow_runs_one;

    const runId = run.id;

    console.log(
      `Created workflow_run ${runId}`
    );

    // --------------------------------------------------
    // 5. Mark workflow run as running
    // --------------------------------------------------

    const startRunMutation = `
      mutation StartWorkflowRun($id: uuid!) {
        update_workflow_runs_by_pk(
          pk_columns: { id: $id }
          _set: {
            status: "running"
            started_at: "now()"
          }
        ) {
          id
          status
          started_at
        }
      }
    `;

    const startRunResponse = await fetch(
      process.env.NHOST_GRAPHQL_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret":
            process.env.NHOST_ADMIN_SECRET,
        },
        body: JSON.stringify({
          query: startRunMutation,
          variables: {
            id: runId,
          },
        }),
      }
    );

    const startRunResult =
      await startRunResponse.json();

    if (
      !startRunResponse.ok ||
      startRunResult.errors
    ) {
      console.error(
        "Failed to start workflow run:",
        startRunResult.errors
      );
    }

    // --------------------------------------------------
    // 6. Execute every workflow step
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

      const createStepRunResponse = await fetch(
        process.env.NHOST_GRAPHQL_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hasura-admin-secret":
              process.env.NHOST_ADMIN_SECRET,
          },
          body: JSON.stringify({
            query: createStepRunMutation,
            variables: {
              workflow_run_id: runId,
              workflow_step_id: step.id,
              input: stepInput,
            },
          }),
        }
      );

      const createStepRunResult =
        await createStepRunResponse.json();

      if (
        !createStepRunResponse.ok ||
        createStepRunResult.errors
      ) {
        console.error(
          "Failed to create step_run:",
          createStepRunResult.errors
        );

        throw new Error(
          `Failed to create step_run for ${step.name}`
        );
      }

      const stepRun =
        createStepRunResult.data.insert_step_runs_one;

      const stepRunId = stepRun.id;

      console.log(
        `Created step_run ${stepRunId} for step ${step.name}`
      );

      // ------------------------------------------------
      // Mark step as running
      // ------------------------------------------------

      const startStepRunMutation = `
        mutation StartStepRun($id: uuid!) {
          update_step_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "running"
            }
          ) {
            id
            status
          }
        }
      `;

      await fetch(
        process.env.NHOST_GRAPHQL_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hasura-admin-secret":
              process.env.NHOST_ADMIN_SECRET,
          },
          body: JSON.stringify({
            query: startStepRunMutation,
            variables: {
              id: stepRunId,
            },
          }),
        }
      );

      // ------------------------------------------------
      // 7. Execute step based on its type
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
            `Executing LLM step using model: ${model}`
          );

          if (!process.env.OPENROUTER_API_KEY) {
            throw new Error(
              "OPENROUTER_API_KEY is not configured"
            );
          }

          // --------------------------------------------
          // Call OpenRouter
          // --------------------------------------------

          const llmResponse = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
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
            }
          );

          const llmResult =
            await llmResponse.json();

          // --------------------------------------------
          // Check LLM response
          // --------------------------------------------

          if (!llmResponse.ok) {
            console.error(
              "OpenRouter error:",
              llmResult
            );

            throw new Error(
              llmResult?.error?.message ||
                "OpenRouter request failed"
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
            model: llmResult.model || model,
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
        // 8. Save successful step output
        // ------------------------------------------------

        const completeStepRunMutation = `
          mutation CompleteStepRun(
            $id: uuid!
            $output: jsonb
          ) {
            update_step_runs_by_pk(
              pk_columns: { id: $id }
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

        const completeStepRunResponse =
          await fetch(
            process.env.NHOST_GRAPHQL_URL,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-hasura-admin-secret":
                  process.env.NHOST_ADMIN_SECRET,
              },
              body: JSON.stringify({
                query:
                  completeStepRunMutation,
                variables: {
                  id: stepRunId,
                  output: stepOutput,
                },
              }),
            }
          );

        const completeStepRunResult =
          await completeStepRunResponse.json();

        if (
          !completeStepRunResponse.ok ||
          completeStepRunResult.errors
        ) {
          console.error(
            "Failed to complete step_run:",
            completeStepRunResult.errors
          );

          throw new Error(
            `Failed to save output for ${step.name}`
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
              pk_columns: { id: $id }
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

        await fetch(
          process.env.NHOST_GRAPHQL_URL,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-hasura-admin-secret":
                process.env.NHOST_ADMIN_SECRET,
            },
            body: JSON.stringify({
              query: failStepRunMutation,
              variables: {
                id: stepRunId,
                error: errorMessage,
              },
            }),
          }
        );

        // ----------------------------------------------
        // Mark workflow as failed
        // ----------------------------------------------

        const failWorkflowMutation = `
          mutation FailWorkflowRun(
            $id: uuid!
            $error: String!
          ) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $id }
              _set: {
                status: "failed"
                error: $error
                completed_at: "now()"
              }
            ) {
              id
              status
              error
              completed_at
            }
          }
        `;

        await fetch(
          process.env.NHOST_GRAPHQL_URL,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-hasura-admin-secret":
                process.env.NHOST_ADMIN_SECRET,
            },
            body: JSON.stringify({
              query: failWorkflowMutation,
              variables: {
                id: runId,
                error: errorMessage,
              },
            }),
          }
        );

        // ----------------------------------------------
        // IMPORTANT:
        // Return 200 so Hasura Action doesn't produce
        // "expecting 2xx or 4xx, but found 500"
        // ----------------------------------------------

        return res.status(200).json({
          success: false,
          message: `Step execution failed: ${step.name}`,
          workflow_id: workflowId,
          run_id: runId,
        });
      }
    }

    // --------------------------------------------------
    // 9. All steps completed
    // --------------------------------------------------

    const completeWorkflowMutation = `
      mutation CompleteWorkflowRun($id: uuid!) {
        update_workflow_runs_by_pk(
          pk_columns: { id: $id }
          _set: {
            status: "completed"
            completed_at: "now()"
          }
        ) {
          id
          status
          completed_at
        }
      }
    `;

    const completeWorkflowResponse =
      await fetch(
        process.env.NHOST_GRAPHQL_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hasura-admin-secret":
              process.env.NHOST_ADMIN_SECRET,
          },
          body: JSON.stringify({
            query: completeWorkflowMutation,
            variables: {
              id: runId,
            },
          }),
        }
      );

    const completeWorkflowResult =
      await completeWorkflowResponse.json();

    if (
      !completeWorkflowResponse.ok ||
      completeWorkflowResult.errors
    ) {
      console.error(
        "Failed to complete workflow run:",
        completeWorkflowResult.errors
      );

      return res.status(500).json({
        success: false,
        message: "Workflow completed but status update failed",
        workflow_id: workflowId,
        run_id: runId,
      });
    }

    // --------------------------------------------------
    // 10. Final successful response
    // --------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Workflow completed successfully",
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
      workflow_id: null,
    });
  }
};