export default async (req, res) => {
  try {
    const workflowId = req.body?.input?.workflow_id;

    if (!workflowId) {
      return res.status(400).json({
        success: false,
        message: "workflow_id is required",
        workflow_id: null,
      });
    }

    const mutation = `
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

    const response = await fetch(process.env.NHOST_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          workflow_id: workflowId,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok || result.errors) {
      console.error("GraphQL error:", result.errors);

      return res.status(500).json({
        success: false,
        message: "Failed to create workflow run",
        workflow_id: workflowId,
      });
    }

    const run = result.data.insert_workflow_runs_one;

    return res.status(200).json({
      success: true,
      message: "Workflow run created",
      workflow_id: run.workflow_id,
      run_id: run.id,
      status: run.status,
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