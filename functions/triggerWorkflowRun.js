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

    const workflowId =
      req.body?.input?.workflow_id;

    if (!workflowId) {
      return res.status(400).json({
        success: false,
        message: "workflow_id is required",
        workflow_id: null,
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
        workflow_id: workflowId,
      });
    }

    if (!process.env.NHOST_ADMIN_SECRET) {
      return res.status(500).json({
        success: false,
        message:
          "NHOST_ADMIN_SECRET is not configured",
        workflow_id: workflowId,
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
    // 4. Get workflow steps
    // --------------------------------------------------

    const stepsQuery = `
      query GetWorkflowSteps(
        $workflow_id: uuid!
      ) {
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

    let steps;

    try {
      const data =
        await graphqlRequest(
          stepsQuery,
          {
            workflow_id: workflowId,
          }
        );

      steps =
        data.workflow_steps || [];
    } catch (error) {
      console.error(
        "Failed to fetch workflow steps:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch workflow steps",
        error: error.message,
        workflow_id: workflowId,
      });
    }

    // --------------------------------------------------
    // 5. Validate workflow
    // --------------------------------------------------

    if (steps.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Workflow has no steps",
        workflow_id: workflowId,
      });
    }

    // --------------------------------------------------
    // 6. Create workflow run
    // --------------------------------------------------

    const createRunMutation = `
      mutation CreateWorkflowRun(
        $workflow_id: uuid!
      ) {
        insert_workflow_runs_one(
          object: {
            workflow_id: $workflow_id
            status: "running"
          }
        ) {
          id
          workflow_id
          status
          started_at
        }
      }
    `;

    let run;

    try {
      const data =
        await graphqlRequest(
          createRunMutation,
          {
            workflow_id: workflowId,
          }
        );

      run =
        data.insert_workflow_runs_one;
    } catch (error) {
      console.error(
        "Failed to create workflow run:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to create workflow run",
        error: error.message,
        workflow_id: workflowId,
      });
    }

    const runId = run.id;

    // --------------------------------------------------
    // 7. Create FIRST step run
    // --------------------------------------------------

    const firstStep = steps[0];

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
        }
      }
    `;

    try {
      await graphqlRequest(
        createStepRunMutation,
        {
          workflow_run_id: runId,
          workflow_step_id: firstStep.id,
          input: {
            previous_output: null,
          },
        }
      );
    } catch (error) {
      console.error(
        "Failed to create first step run:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to create first step run",
        error: error.message,
        workflow_id: workflowId,
        run_id: runId,
      });
    }

    console.log(
      `Workflow ${workflowId} started with run ${runId}`
    );

    // --------------------------------------------------
    // 8. Return immediately
    // --------------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        "Workflow execution started",
      workflow_id: workflowId,
      run_id: runId,
      status: "running",
      step_count: steps.length,
    });
  } catch (error) {
    console.error(
      "Function error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error:
        error?.message ||
        "Unknown error",
      workflow_id: null,
    });
  }
};