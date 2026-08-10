export default async (req, res) => {
  const startTime = Date.now();

  // ============================================================
  // HELPERS
  // ============================================================

  const remainingTime = () => {
    return 9000 - (Date.now() - startTime);
  };

  const graphqlRequest = async (
    query,
    variables = {}
  ) => {
    const controller =
      new AbortController();

    // Keep GraphQL requests short so the Nhost
    // Function does not hit its 10-second limit.
    const availableTime =
      remainingTime();

    const timeoutMs = Math.max(
      1000,
      Math.min(
        2000,
        availableTime - 500
      )
    );

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response =
        await fetch(
          process.env.NHOST_GRAPHQL_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-hasura-admin-secret":
                process.env.NHOST_ADMIN_SECRET,
            },

            body: JSON.stringify({
              query,
              variables,
            }),

            signal:
              controller.signal,
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
    } catch (error) {
      if (
        error.name ===
        "AbortError"
      ) {
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
  // 1. READ HASURA EVENT
  // ============================================================

  try {
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

    console.log(
      `Starting step ${workflowStepId}`
    );

    // ============================================================
    // 2. ENVIRONMENT VARIABLES
    // ============================================================

    if (
      !process.env.NHOST_GRAPHQL_URL
    ) {
      return res.status(500).json({
        success: false,
        message:
          "NHOST_GRAPHQL_URL is not configured",
      });
    }

    if (
      !process.env.NHOST_ADMIN_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message:
          "NHOST_ADMIN_SECRET is not configured",
      });
    }

    if (
      !process.env.OPENROUTER_API_KEY
    ) {
      return res.status(500).json({
        success: false,
        message:
          "OPENROUTER_API_KEY is not configured",
      });
    }

    // ============================================================
    // 3. GET CURRENT STEP
    // ============================================================

    const stepQuery = `
      query GetWorkflowStep(
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

    const stepData =
      await graphqlRequest(
        stepQuery,
        {
          step_id:
            workflowStepId,
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
      `Executing: ${step.name} (${step.type})`
    );

    // ============================================================
    // 4. GET NEXT STEP
    // ============================================================

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
          workflow_id:
            step.workflow_id,

          step_order:
            step.step_order,
        }
      );

    const nextStep =
      nextStepData.workflow_steps?.[0] ||
      null;

    // ============================================================
    // 5. EXECUTE STEP
    // ============================================================

    let stepOutput;

    try {
      // ==========================================================
      // LLM STEP
      // ==========================================================

      if (step.type === "llm") {
        const config =
          step.config || {};

        // --------------------------------------------------------
        // Prompt
        // --------------------------------------------------------

        const basePrompt =
          config.prompt ??
          config.message ??
          step.name ??
          "Complete this task.";

        // --------------------------------------------------------
        // Previous step output
        // --------------------------------------------------------

        const previousOutput =
          stepInput.previous_output;

        let prompt =
          basePrompt;

        if (previousOutput) {
          prompt += `

Previous step output:
${JSON.stringify(
  previousOutput
)}
`;
        }

        // --------------------------------------------------------
        // Model
        // --------------------------------------------------------

        const model =
          config.model ||
          "openrouter/free";

        console.log(
          `Calling OpenRouter using ${model}`
        );

        // --------------------------------------------------------
        // OpenRouter timeout
        // --------------------------------------------------------

        const controller =
          new AbortController();

        const availableTime =
          remainingTime();

        const timeoutMs =
          Math.min(
            4000,
            Math.max(
              1000,
              availableTime - 1500
            )
          );

        const timeout =
          setTimeout(() => {
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

                  // Keep response small
                  // to improve execution speed.
                  max_tokens:
                    config.max_tokens ||
                    300,
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
        // Read OpenRouter response
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

        // --------------------------------------------------------
        // OpenRouter error
        // --------------------------------------------------------

        if (!llmResponse.ok) {
          throw new Error(
            llmResult?.error?.message ||
              `OpenRouter request failed with status ${llmResponse.status}`
          );
        }

        // --------------------------------------------------------
        // Extract AI text
        // --------------------------------------------------------

        const aiText =
          llmResult
            ?.choices?.[0]
            ?.message?.content;

        if (!aiText) {
          throw new Error(
            "OpenRouter returned no text response"
          );
        }

        // --------------------------------------------------------
        // Output
        // --------------------------------------------------------

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

      // ==========================================================
      // UNSUPPORTED STEP TYPE
      // ==========================================================

      else {
        throw new Error(
          `Unsupported step type: ${step.type}`
        );
      }
    } catch (stepError) {
      // ==========================================================
      // STEP FAILED
      // ==========================================================

      console.error(
        `Step failed: ${step.name}`,
        stepError
      );

      const errorMessage =
        stepError?.message ||
        "Unknown step error";

      // ----------------------------------------------------------
      // Mark step failed
      // ----------------------------------------------------------

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
            error:
              errorMessage,
          }
        );
      } catch (dbError) {
        console.error(
          "Could not update failed step:",
          dbError
        );
      }

      // ----------------------------------------------------------
      // Mark workflow failed
      // ----------------------------------------------------------

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
              error
            }
          }
        `;

        await graphqlRequest(
          failWorkflowMutation,
          {
            id: workflowRunId,
            error:
              errorMessage,
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

        error:
          errorMessage,

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

        output:
          stepOutput,
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
              workflow_run_id:
                $workflow_run_id

              workflow_step_id:
                $workflow_step_id

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
          Date.now() -
          startTime,
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
        id:
          workflowRunId,
      }
    );

    console.log(
      `Workflow completed: ${workflowRunId}`
    );

    // ============================================================
    // 9. FINAL RESPONSE
    // ============================================================

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
        Date.now() -
        startTime,
    });
  } catch (error) {
    // ============================================================
    // UNEXPECTED ERROR
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

      duration_ms:
        Date.now() -
        startTime,
    });
  }
};