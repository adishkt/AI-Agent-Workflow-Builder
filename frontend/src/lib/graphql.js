import { nhost } from "./nhost";

// Get workflows available to the logged-in user
export async function getWorkflows() {
  const response = await nhost.graphql.request({
    query: `
      query GetWorkflows {
        workflows(
          order_by: {
            created_at: desc
          }
        ) {
          id
          org_id
          name
          description
          created_at
          updated_at

          workflow_steps(
            order_by: {
              step_order: asc
            }
          ) {
            id
            step_order
            name
            type
            config
          }
        }
      }
    `,
  });

  if (response.error) {
    throw new Error(
      response.error.message || "Failed to load workflows"
    );
  }

  return response.body?.data?.workflows || [];
}


// Get the organization of the logged-in user
export async function getUserOrganization() {
  const response = await nhost.graphql.request({
    query: `
      query GetUserOrganization {
        org_members(
          limit: 1
        ) {
          org_id
          role

          organization {
            id
            name
          }
        }
      }
    `,
  });

  if (response.error) {
    throw new Error(
      response.error.message ||
        "Failed to load user organization"
    );
  }

  const memberships =
    response.body?.data?.org_members || [];

  if (memberships.length === 0) {
    throw new Error(
      "You are not a member of any organization"
    );
  }

  return memberships[0];
}


// Create a new workflow
export async function createWorkflow({
  orgId,
  name,
  description,
}) {
  const response = await nhost.graphql.request({
    query: `
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
    variables: {
      orgId,
      name,
      description: description || null,
    },
  });

  if (response.error) {
    throw new Error(
      response.error.message ||
        "Failed to create workflow"
    );
  }

  return response.body?.data?.insert_workflows_one;
}

// Update a workflow
export async function updateWorkflow({
  id,
  name,
  description,
}) {
  const response = await nhost.graphql.request({
    query: `
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
    variables: {
      id,
      name,
      description: description || null,
    },
  });

  if (response.error) {
    throw new Error(
      response.error.message || "Failed to update workflow"
    );
  }

  return response.body?.data?.update_workflows_by_pk;
}

// Delete a workflow
export async function deleteWorkflow(id) {
  const response = await nhost.graphql.request({
    query: `
      mutation DeleteWorkflow($id: uuid!) {
        delete_workflows_by_pk(id: $id) {
          id
        }
      }
    `,
    variables: {
      id,
    },
  });

  if (response.error) {
    throw new Error(
      response.error.message || "Failed to delete workflow"
    );
  }

  return response.body?.data?.delete_workflows_by_pk;
}

// Create a workflow step
export async function createWorkflowStep({
  workflowId,
  stepOrder,
  name,
  type,
  config,
}) {
  const response = await nhost.graphql.request({
    query: `
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
    variables: {
      workflowId,
      stepOrder,
      name,
      type,
      config,
    },
  });

  if (response.error) {
    throw new Error(
      response.error.message ||
        "Failed to create workflow step"
    );
  }

  return response.body?.data?.insert_workflow_steps_one;
}