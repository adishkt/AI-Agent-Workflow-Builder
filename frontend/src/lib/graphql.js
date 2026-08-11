import { nhost } from "./nhost";

async function request(query, variables = {}) {
  const response = await nhost.graphql.request({
    query,
    variables,
  });

  if (response.error) {
    throw new Error(
      response.error.message || "GraphQL request failed"
    );
  }

  const errors = response.body?.errors;
  if (errors?.length) {
    throw new Error(errors[0]?.message || "GraphQL request failed");
  }

  return response.body?.data;
}

// Get workflows available to the logged-in user.
export async function getWorkflows() {
  const data = await request(`
    query GetWorkflows {
      workflows(order_by: { created_at: desc }) {
        id
        org_id
        name
        description
        created_at
        updated_at
        workflow_steps(order_by: { step_order: asc }) {
          id
          workflow_id
          step_order
          name
          type
          config
        }
      }
    }
  `);

  return data?.workflows || [];
}

export async function getUserOrganization() {
  const data = await request(`
    query GetUserOrganization {
      org_members(limit: 1) {
        org_id
        role
        organization {
          id
          name
        }
      }
    }
  `);

  const memberships = data?.org_members || [];

  if (!memberships.length) {
    throw new Error("You are not a member of any organization");
  }

  return memberships[0];
}

export async function createWorkflow({ orgId, name, description }) {
  const data = await request(
    `
      mutation CreateWorkflow(
        $orgId: uuid!
        $name: String!
        $description: String
      ) {
        insert_workflows_one(
          object: {
            org_id: $orgId
            name: $name
            description: $description
          }
        ) {
          id
          org_id
          name
          description
          created_at
          updated_at
        }
      }
    `,
    {
      orgId,
      name,
      description: description || null,
    }
  );

  return data?.insert_workflows_one;
}

export async function updateWorkflow({ id, name, description }) {
  const data = await request(
    `
      mutation UpdateWorkflow(
        $id: uuid!
        $name: String!
        $description: String
      ) {
        update_workflows_by_pk(
          pk_columns: { id: $id }
          _set: {
            name: $name
            description: $description
          }
        ) {
          id
          org_id
          name
          description
          created_at
          updated_at
        }
      }
    `,
    {
      id,
      name,
      description: description || null,
    }
  );

  return data?.update_workflows_by_pk;
}

export async function deleteWorkflow(id) {
  const data = await request(
    `
      mutation DeleteWorkflow($id: uuid!) {
        delete_workflows_by_pk(id: $id) {
          id
        }
      }
    `,
    { id }
  );

  return data?.delete_workflows_by_pk;
}

export async function createWorkflowStep({
  workflowId,
  stepOrder,
  name,
  type,
  config,
}) {
  const data = await request(
    `
      mutation CreateWorkflowStep(
        $workflowId: uuid!
        $stepOrder: Int!
        $name: String!
        $type: String!
        $config: jsonb!
      ) {
        insert_workflow_steps_one(
          object: {
            workflow_id: $workflowId
            step_order: $stepOrder
            name: $name
            type: $type
            config: $config
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
    `,
    {
      workflowId,
      stepOrder,
      name,
      type,
      config,
    }
  );

  return data?.insert_workflow_steps_one;
}

// Start a workflow through the Hasura Action.
export async function triggerWorkflowRun(workflowId) {
  const data = await request(
    `
      mutation TriggerWorkflowRun($workflowId: uuid!) {
        triggerWorkflowRun(workflow_id: $workflowId) {
          success
          message
          workflow_id
          run_id
          status
          step_count
        }
      }
    `,
    { workflowId }
  );

  const result = data?.triggerWorkflowRun;

  if (!result?.success) {
    throw new Error(result?.message || "Could not start workflow");
  }

  return result;
}

// Approve a paused approval-gate step through the Hasura Action.
export async function approveStep(stepRunId) {
  const data = await request(
    `
      mutation ApproveStep($stepId: uuid!) {
        approveStep(step_id: $stepId) {
          success
          message
        }
      }
    `,
    { stepId: stepRunId }
  );

  const result = data?.approveStep;

  if (!result?.success) {
    throw new Error(result?.message || "Could not approve step");
  }

  return result;
}

// Load a workflow run and all of its step runs.
export async function getWorkflowRun(runId) {
  const data = await request(
    `
      query GetWorkflowRun($runId: uuid!) {
        workflow_runs_by_pk(id: $runId) {
          id
          workflow_id
          status
          error
        }
        step_runs(where: { workflow_run_id: { _eq: $runId } }) {
          id
          workflow_run_id
          workflow_step_id
          status
          input
          output
          error
        }
      }
    `,
    { runId }
  );

  return {
    run: data?.workflow_runs_by_pk || null,
    stepRuns: data?.step_runs || [],
  };
}
