export default async (req, res) => {
  try {
    // --------------------------------------------------
    // 1. Get event data
    // --------------------------------------------------

    const event =
      req.body?.event;

    const stepRun =
      event?.data?.new;

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

    // --------------------------------------------------
    // 2. Check environment variables
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 3. GraphQL helper
    // --------------------------------------------------

    const graphqlRequest = async (
      query,
      variables = {}
    ) => {
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

      const text =
        await response.text();

      let result;

      try {
        result =
          JSON.parse(text);
      } catch {
        throw new Error(
          `GraphQL returned invalid JSON: ${text}`
        );
      }

      if (
        !response.ok ||
        result.errors
      ) {
        throw new Error(
          result.errors?.[0]?.message ||
            `GraphQL request failed with status ${response.status}`
        );
      }

      return result.data;
    };

    // --------------------------------------------------
    // 4. Get workflow step
    // --------------------------------------------------

    const stepQuery = `
      query GetWorkflowStep(
        $id: uuid!
      ) {
        workflow_steps_by_pk(
          id: $id
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
          id: workflowStepId,
        }
      );

    const step =
      stepData.workflow_steps_by_pk;

    if (!step) {
      throw new Error(
        "Workflow step not found"
      );
    }

    console.log(
      `Executing step: ${step.name}`
    );

    // --------------------------------------------------
    // 5. Mark step as running
    // --------------------------------------------------

    const startStepMutation = `
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

    await graphqlRequest(
      startStepMutation,
      {
        id: stepRunId,
      }
    );

    // --------------------------------------------------
    // 6. Execute step
    // --------------------------------------------------

    let stepOutput;

    try {
      // ================================================
      // LLM STEP
      // ================================================

      if (step.type === "llm") {
        const config =
          step.config || {};

        const basePrompt =
          config.prompt ??
          config.message ??
          step.name;

        const previousOutput =
          stepInput.previous_output;

        const prompt =
          previousOutput
            ? `${basePrompt}

Previous step output:
${JSON.stringify(previousOutput)}`
            : basePrompt;

        const model =
          config.model ??
          "openrouter/free";

        // ----------------------------------------------
        // Check API key
        // ----------------------------------------------

        if (
          !process.env.OPENROUTER_API_KEY
        ) {
          throw new Error(
            "OPENROUTER_API_KEY is not configured"
          );
        }

        // ----------------------------------------------
        // Timeout helper
        // ----------------------------------------------

        const controller =
          new AbortController();

        const timeout =
          setTimeout(() => {
            controller.abort();
          }, 7000);

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
              "OpenRouter request timed out after 7 seconds"
            );
          }

          throw new Error(
            `Could not connect to OpenRouter: ${error.message}`
          );
        } finally {
          clearTimeout(timeout);
        }

        // ----------------------------------------------
        // Read OpenRouter response
        // ----------------------------------------------

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
            `OpenRouter returned invalid JSON: ${responseText}`
          );
        }

        if (!llmResponse.ok) {
          throw new Error(
            llmResult?.error?.message ||
              `OpenRouter request failed with status ${llmResponse.status}`
          );
        }

        const aiText =
          llmResult?.choices?.[0]
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
      }

      // ================================================
      // UNSUPPORTED STEP TYPE
      // ================================================

      else {
        throw new Error(
          `Unsupported step type: ${step.type}`
        );
      }

      // ------------------------------------------------
      // 7. Get next workflow step
      // ------------------------------------------------

      const nextStepQuery = `
        query GetNextWorkflowStep(
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
            workflow_id:
              step.workflow_id,
            step_order:
              step.step_order,
          }
        );

      const nextStep =
        nextStepData
          .workflow_steps?.[0] ||
        null;

      // ------------------------------------------------
      // 8. Complete current step
      // ------------------------------------------------

      const completeStepMutation = `
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

      await graphqlRequest(
        completeStepMutation,
        {
          id: stepRunId,
          output: stepOutput,
        }
      );

      console.log(
        `Completed step: ${step.name}`
      );

      // ------------------------------------------------
      // 9. Start next step OR complete workflow
      // ------------------------------------------------

      if (nextStep) {
        const createNextStepRunMutation = `
          mutation CreateNextStepRun(
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
          createNextStepRunMutation,
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
          `Created next step: ${nextStep.name}`
        );

        return res.status(200).json({
          success: true,
          message:
            "Step completed and next step started",
          step_run_id: stepRunId,
          workflow_run_id:
            workflowRunId,
          completed_step:
            step.name,
          next_step:
            nextStep.name,
        });
      }

      // ------------------------------------------------
      // 10. No next step → complete workflow
      // ------------------------------------------------

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

      await graphqlRequest(
        completeWorkflowMutation,
        {
          id: workflowRunId,
        }
      );

      console.log(
        `Workflow ${workflowRunId} completed`
      );

      return res.status(200).json({
        success: true,
        message:
          "Workflow completed successfully",
        workflow_run_id:
          workflowRunId,
        completed_step:
          step.name,
      });
    } catch (stepError) {
      // ------------------------------------------------
      // 11. Step failed
      // ------------------------------------------------

      console.error(
        `Step failed: ${step.name}`,
        stepError
      );

      const errorMessage =
        stepError?.message ||
        "Unknown step error";

      // ----------------------------------------------
      // Mark step failed
      // ----------------------------------------------

      const failStepMutation = `
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
          failStepMutation,
          {
            id: stepRunId,
            error: errorMessage,
          }
        );
      } catch (error) {
        console.error(
          "Failed to mark step as failed:",
          error
        );
      }

      // ----------------------------------------------
      // Mark workflow failed
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
          }
        }
      `;

      try {
        await graphqlRequest(
          failWorkflowMutation,
          {
            id: workflowRunId,
            error: errorMessage,
          }
        );
      } catch (error) {
        console.error(
          "Failed to mark workflow as failed:",
          error
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
    });
  }
};