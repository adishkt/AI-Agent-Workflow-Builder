export default async (req, res) => {
  try {
    const workflowId = req.body?.input?.workflow_id;

    // 1. Validate workflow_id
    if (!workflowId) {
      return res.status(400).json({
        success: false,
        message: "workflow_id is required",
        workflow_id: null,
      });
    }

    // 2. Fetch the workflow steps
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

    const stepsResponse = await fetch(process.env.NHOST_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: stepsQuery,
        variables: {
          workflow_id: workflowId,
        },
      }),
    });

    const stepsResult = await stepsResponse.json();

    // 3. Check whether fetching steps failed
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

    // 4. A workflow must have at least one step
    if (steps.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Workflow has no steps",
        workflow_id: workflowId,
      });
    }

    // 5. Create the workflow run
    const workflowRunMutation = `
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

    const workflowRunResponse = await fetch(
      process.env.NHOST_GRAPHQL_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET,
        },
        body: JSON.stringify({
          query: workflowRunMutation,
          variables: {
            workflow_id: workflowId,
          },
        }),
      }
    );

    const workflowRunResult = await workflowRunResponse.json();

    // 6. Check whether workflow_run creation failed
    if (!workflowRunResponse.ok || workflowRunResult.errors) {
      console.error(
        "Failed to create workflow run:",
        workflowRunResult.errors
      );

      return res.status(500).json({
        success: false,
        message: "Failed to create workflow run",
        workflow_id: workflowId,
      });
    }

    // 7. Get the newly created workflow run
    const run = workflowRunResult.data.insert_workflow_runs_one;

    // 8. Create one step_run for every workflow step
    const stepRunMutation = `
      mutation CreateStepRun(
        $workflow_run_id: uuid!
        $workflow_step_id: uuid!
      ) {
        insert_step_runs_one(
          object: {
            workflow_run_id: $workflow_run_id
            workflow_step_id: $workflow_step_id
            status: "pending"
            attempt_count: 0
          }
        ) {
          id
          workflow_run_id
          workflow_step_id
          status
          attempt_count
        }
      }
    `;

    for (const step of steps) {
      const stepRunResponse = await fetch(
        process.env.NHOST_GRAPHQL_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hasura-admin-secret":
              process.env.NHOST_ADMIN_SECRET,
          },
          body: JSON.stringify({
            query: stepRunMutation,
            variables: {
              workflow_run_id: run.id,
              workflow_step_id: step.id,
            },
          }),
        }
      );

      const stepRunResult = await stepRunResponse.json();

      // 9. Stop if creating a step_run fails
      if (!stepRunResponse.ok || stepRunResult.errors) {
        console.error(
          `Failed to create step_run for ${step.name}:`,
          stepRunResult.errors
        );

        return res.status(500).json({
          success: false,
          message: `Failed to create step run for ${step.name}`,
          workflow_id: workflowId,
          run_id: run.id,
        });
      }

      console.log(
        `Created step_run for step: ${step.name}`
      );
    }

    // 10. Return the created workflow run
    return res.status(200).json({
      success: true,
      message: "Workflow run created",
      workflow_id: run.workflow_id,
      run_id: run.id,
      status: run.status,
      step_count: steps.length,
    });
  } catch (error) {
    console.error("Function error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      workflow_id: null,
    });
  }
};