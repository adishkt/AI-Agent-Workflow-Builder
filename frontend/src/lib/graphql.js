import { nhost } from "./nhost";

/*
|--------------------------------------------------------------------------
| GraphQL Request Helper
|--------------------------------------------------------------------------
|
| role:
|   "user"   -> authenticated Nhost user role
|   "owner"  -> organization owner
|   "editor" -> organization editor
|   "viewer" -> organization viewer
|
*/

async function request(
  query,
  variables = {},
  role = null
) {
  const options = {};

  if (role) {
    options.headers = {
      "x-hasura-role": role,
    };
  }

  try {
    const response =
      await nhost.graphql.request(
        {
          query,
          variables,
        },
        options
      );

    /*
     * Handle GraphQL errors returned in the response.
     */
    const errors =
      response.body?.errors;

    if (errors?.length) {
      throw new Error(
        errors[0]?.message ||
          "GraphQL request failed"
      );
    }

    /*
     * Handle Nhost-level errors.
     */
    if (response.error) {
      throw new Error(
        response.error.message ||
          "GraphQL request failed"
      );
    }

    return response.body?.data;
  } catch (error) {
    console.error(
      "GraphQL request failed:",
      error
    );

    throw new Error(
      error?.message ||
        "GraphQL request failed"
    );
  }
}


/*
|--------------------------------------------------------------------------
| Get Current User Organization
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| org_members currently exposes:
|
|   id
|   org_id
|   user_id
|   role
|
| There is NO "organization" relationship exposed by Hasura.
|
| Therefore we only query the fields that actually exist.
|
| The normal authenticated "user" role is used here.
|
*/

export async function getUserOrganization() {
  const data =
    await request(
      `
        query GetUserOrganization {
          org_members(
            limit: 1
          ) {
            id
            org_id
            user_id
            role
          }
        }
      `,
      {},
      "user"
    );

  const memberships =
    data?.org_members || [];

  if (!memberships.length) {
    throw new Error(
      "You are not a member of any organization"
    );
  }

  const membership =
    memberships[0];

  const role =
    membership.role;

  if (
    ![
      "owner",
      "editor",
      "viewer",
    ].includes(role)
  ) {
    throw new Error(
      `Unsupported organization role: ${role}`
    );
  }

  return membership;
}


/*
|--------------------------------------------------------------------------
| Get Current User Role
|--------------------------------------------------------------------------
*/

export async function getCurrentUserRole() {
  const membership =
    await getUserOrganization();

  return membership.role;
}


/*
|--------------------------------------------------------------------------
| Get Workflows
|--------------------------------------------------------------------------
|
| owner  -> SELECT
| editor -> SELECT
| viewer -> SELECT
|
*/

export async function getWorkflows() {
  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
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
              workflow_id
              step_order
              name
              type
              config
            }
          }
        }
      `,
      {},
      role
    );

  return data?.workflows || [];
}


/*
|--------------------------------------------------------------------------
| Create Workflow
|--------------------------------------------------------------------------
|
| owner  -> allowed
| editor -> allowed
| viewer -> rejected by Hasura
|
*/

export async function createWorkflow({
  orgId,
  name,
  description,
}) {
  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
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
        description:
          description || null,
      },
      role
    );

  return data?.insert_workflows_one;
}


/*
|--------------------------------------------------------------------------
| Update Workflow
|--------------------------------------------------------------------------
|
| owner  -> allowed
| editor -> allowed
| viewer -> rejected
|
*/

export async function updateWorkflow({
  id,
  name,
  description,
}) {
  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation UpdateWorkflow(
          $id: uuid!
          $name: String!
          $description: String
        ) {
          update_workflows_by_pk(
            pk_columns: {
              id: $id
            }

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
        description:
          description || null,
      },
      role
    );

  return data?.update_workflows_by_pk;
}


/*
|--------------------------------------------------------------------------
| Delete Workflow
|--------------------------------------------------------------------------
|
| owner  -> allowed
| editor -> rejected
| viewer -> rejected
|
*/

export async function deleteWorkflow(
  id
) {
  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation DeleteWorkflow(
          $id: uuid!
        ) {
          delete_workflows_by_pk(
            id: $id
          ) {
            id
          }
        }
      `,
      {
        id,
      },
      role
    );

  return data?.delete_workflows_by_pk;
}


/*
|--------------------------------------------------------------------------
| Create Workflow Step
|--------------------------------------------------------------------------
|
| owner  -> allowed
| editor -> allowed
| viewer -> rejected
|
*/

export async function createWorkflowStep({
  workflowId,
  stepOrder,
  name,
  type,
  config,
}) {
  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
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
      },
      role
    );

  return data?.insert_workflow_steps_one;
}


/*
|--------------------------------------------------------------------------
| Trigger Workflow Run
|--------------------------------------------------------------------------
|
| owner/editor/viewer permissions are enforced
| by the Hasura Action configuration.
|
*/

export async function triggerWorkflowRun(
  workflowId
) {
  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation TriggerWorkflowRun(
          $workflowId: uuid!
        ) {
          triggerWorkflowRun(
            workflow_id: $workflowId
          ) {
            success
            message
            workflow_id
            run_id
            status
            step_count
          }
        }
      `,
      {
        workflowId,
      },
      role
    );

  const result =
    data?.triggerWorkflowRun;

  if (!result?.success) {
    throw new Error(
      result?.message ||
        "Could not start workflow"
    );
  }

  return result;
}


/*
|--------------------------------------------------------------------------
| Approve Approval Gate
|--------------------------------------------------------------------------
|
| owner  -> allowed
| editor -> allowed
| viewer -> rejected
|
*/

export async function approveStep(
  stepRunId
) {
  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation ApproveStep(
          $stepId: uuid!
        ) {
          approveStep(
            step_id: $stepId
          ) {
            success
            message
          }
        }
      `,
      {
        stepId: stepRunId,
      },
      role
    );

  const result =
    data?.approveStep;

  if (!result?.success) {
    throw new Error(
      result?.message ||
        "Could not approve step"
    );
  }

  return result;
}


/*
|--------------------------------------------------------------------------
| Get Workflow Run
|--------------------------------------------------------------------------
|
| owner  -> SELECT
| editor -> SELECT
| viewer -> SELECT
|
*/

export async function getWorkflowRun(
  runId
) {
  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        query GetWorkflowRun(
          $runId: uuid!
        ) {
          workflow_runs_by_pk(
            id: $runId
          ) {
            id
            workflow_id
            status
            error
          }

          step_runs(
            where: {
              workflow_run_id: {
                _eq: $runId
              }
            }
          ) {
            id
            workflow_run_id
            workflow_step_id
            status
            input
            output
            error
            attempt_count
            approved_by
            approved_at
          }
        }
      `,
      {
        runId,
      },
      role
    );

  return {
    run:
      data?.workflow_runs_by_pk ||
      null,

    stepRuns:
      data?.step_runs || [],
  };
}