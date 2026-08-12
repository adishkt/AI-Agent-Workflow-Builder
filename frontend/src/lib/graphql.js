import { nhost } from "./nhost";

/*
|--------------------------------------------------------------------------
| GraphQL Request Helper
|--------------------------------------------------------------------------
|
| role:
|   null   -> normal authenticated user role
|   owner  -> organization owner
|   editor -> organization editor
|   viewer -> organization viewer
|
*/

async function request(
  query,
  variables = {},
  role = null
) {
  const options = {};

  /*
   * Only send x-hasura-role when explicitly
   * using an organization role.
   */
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
     * GraphQL errors.
     */
    const errors =
      response?.body?.errors;

    if (errors?.length) {
      throw new Error(
        errors[0]?.message ||
          "GraphQL request failed"
      );
    }

    /*
     * Nhost request-level error.
     */
    if (response?.error) {
      throw new Error(
        response.error.message ||
          "GraphQL request failed"
      );
    }

    return response?.body?.data || null;
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
| We use the normal authenticated user role.
|
| Hasura should restrict org_members using:
|
| user_id _eq X-Hasura-User-Id
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

  console.log(
    "ORG MEMBERS RESPONSE:",
    data
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

  console.log(
    "CURRENT MEMBERSHIP:",
    membership
  );

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

  console.log(
    "CURRENT ORGANIZATION ROLE:",
    role
  );

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

  const role =
    membership.role;

  console.log(
    "GET CURRENT USER ROLE:",
    role
  );

  return role;
}


/*
|--------------------------------------------------------------------------
| Get Workflows
|--------------------------------------------------------------------------
*/

export async function getWorkflows() {
  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  console.log(
    "GET WORKFLOWS ROLE:",
    role
  );

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
| Get Single Workflow
|--------------------------------------------------------------------------
*/

export async function getWorkflow(
  workflowId
) {
  if (!workflowId) {
    throw new Error(
      "workflowId is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  console.log(
    "GET WORKFLOW ROLE:",
    role
  );

  const data =
    await request(
      `
        query GetWorkflow(
          $workflowId: uuid!
        ) {
          workflows_by_pk(
            id: $workflowId
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
      {
        workflowId,
      },
      role
    );

  return (
    data?.workflows_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Create Workflow
|--------------------------------------------------------------------------
*/

export async function createWorkflow({
  orgId,
  name,
  description,
}) {
  if (!orgId) {
    throw new Error(
      "orgId is required"
    );
  }

  if (!name?.trim()) {
    throw new Error(
      "Workflow name is required"
    );
  }

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

  return (
    data?.insert_workflows_one ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Update Workflow
|--------------------------------------------------------------------------
*/

export async function updateWorkflow({
  id,
  name,
  description,
}) {
  if (!id) {
    throw new Error(
      "Workflow id is required"
    );
  }

  if (!name?.trim()) {
    throw new Error(
      "Workflow name is required"
    );
  }

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

  return (
    data?.update_workflows_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Delete Workflow
|--------------------------------------------------------------------------
*/

export async function deleteWorkflow(
  id
) {
  if (!id) {
    throw new Error(
      "Workflow id is required"
    );
  }

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

  return (
    data?.delete_workflows_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Create Workflow Step
|--------------------------------------------------------------------------
*/

export async function createWorkflowStep({
  workflowId,
  stepOrder,
  name,
  type,
  config,
}) {
  if (!workflowId) {
    throw new Error(
      "workflowId is required"
    );
  }

  if (!name?.trim()) {
    throw new Error(
      "Step name is required"
    );
  }

  if (!type) {
    throw new Error(
      "Step type is required"
    );
  }

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

  return (
    data?.insert_workflow_steps_one ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Update Workflow Step
|--------------------------------------------------------------------------
*/

export async function updateWorkflowStep({
  id,
  stepOrder,
  name,
  type,
  config,
}) {
  if (!id) {
    throw new Error(
      "Step id is required"
    );
  }

  if (!name?.trim()) {
    throw new Error(
      "Step name is required"
    );
  }

  if (!type) {
    throw new Error(
      "Step type is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation UpdateWorkflowStep(
          $id: uuid!
          $stepOrder: Int!
          $name: String!
          $type: String!
          $config: jsonb!
        ) {
          update_workflow_steps_by_pk(
            pk_columns: {
              id: $id
            }

            _set: {
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
        id,
        stepOrder,
        name,
        type,
        config,
      },
      role
    );

  return (
    data?.update_workflow_steps_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Delete Workflow Step
|--------------------------------------------------------------------------
*/

export async function deleteWorkflowStep(
  id
) {
  if (!id) {
    throw new Error(
      "Step id is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation DeleteWorkflowStep(
          $id: uuid!
        ) {
          delete_workflow_steps_by_pk(
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

  return (
    data?.delete_workflow_steps_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Reorder One Workflow Step
|--------------------------------------------------------------------------
*/

export async function reorderWorkflowStep({
  id,
  stepOrder,
}) {
  if (!id) {
    throw new Error(
      "Step id is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation ReorderWorkflowStep(
          $id: uuid!
          $stepOrder: Int!
        ) {
          update_workflow_steps_by_pk(
            pk_columns: {
              id: $id
            }

            _set: {
              step_order: $stepOrder
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
        id,
        stepOrder,
      },
      role
    );

  return (
    data?.update_workflow_steps_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Reorder Multiple Workflow Steps
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Accepts either:
|
| { id, stepOrder }
|
| or:
|
| { id, step_order }
|
*/

export async function reorderWorkflowSteps(
  steps
) {
  if (!Array.isArray(steps)) {
    throw new Error(
      "steps must be an array"
    );
  }

  if (!steps.length) {
    return [];
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const mutations = [];
  const variables = {};
  const variableDefinitions = [];

  steps.forEach(
    (step, index) => {
      const variableName =
        `step${index}`;

      const order =
        step.stepOrder ??
        step.step_order ??
        index + 1;

      mutations.push(`
        ${variableName}: update_workflow_steps_by_pk(
          pk_columns: {
            id: $${variableName}Id
          }

          _set: {
            step_order: $${variableName}Order
          }
        ) {
          id
          workflow_id
          step_order
          name
          type
          config
        }
      `);

      variableDefinitions.push(
        `$${variableName}Id: uuid!`
      );

      variableDefinitions.push(
        `$${variableName}Order: Int!`
      );

      variables[
        `${variableName}Id`
      ] = step.id;

      variables[
        `${variableName}Order`
      ] = order;
    }
  );

  const mutation = `
    mutation ReorderWorkflowSteps(
      ${variableDefinitions.join(", ")}
    ) {
      ${mutations.join("\n")}
    }
  `;

  const data =
    await request(
      mutation,
      variables,
      role
    );

  return Object.values(
    data || {}
  );
}


/*
|--------------------------------------------------------------------------
| Trigger Workflow Run
|--------------------------------------------------------------------------
*/

export async function triggerWorkflowRun(
  workflowId
) {
  if (!workflowId) {
    throw new Error(
      "workflowId is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  console.log(
    "TRIGGER WORKFLOW ROLE:",
    role
  );

  console.log(
    "TRIGGER WORKFLOW:",
    workflowId
  );

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

  console.log(
    "TRIGGER WORKFLOW RESPONSE:",
    result
  );

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
| Hasura Action input:
|
| {
|   "step_run_id": "uuid"
| }
|
| Therefore this MUST use:
|
| approveStep(
|   step_run_id: $stepRunId
| )
|
| NOT:
|
| approveStep(
|   step_id: $stepId
| )
|
*/

export async function approveStep(
  stepRunId
) {
  if (!stepRunId) {
    throw new Error(
      "stepRunId is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  console.log(
    "APPROVE STEP ROLE:",
    role
  );

  console.log(
    "APPROVING STEP RUN:",
    stepRunId
  );

  const data =
    await request(
      `
        mutation ApproveStep(
          $stepRunId: uuid!
        ) {
          approveStep(
            step_run_id: $stepRunId
          ) {
            success
            message
          }
        }
      `,
      {
        stepRunId,
      },
      role
    );

  console.log(
    "APPROVE STEP GRAPHQL DATA:",
    data
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
| IMPORTANT:
|
| Your step_runs table DOES NOT have created_at.
|
| Therefore DO NOT use:
|
| order_by: {
|   created_at: asc
| }
|
| Current step_runs columns:
|
| id
| workflow_run_id
| workflow_step_id
| status
| input
| output
| error
| attempt_count
| approved_by
| approved_at
|
*/

export async function getWorkflowRun(
  runId
) {
  if (!runId) {
    throw new Error(
      "runId is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  console.log(
    "GET WORKFLOW RUN ROLE:",
    role
  );

  console.log(
    "GET WORKFLOW RUN:",
    runId
  );

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
            started_at
            completed_at
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

  console.log(
    "WORKFLOW RUN DATA:",
    data
  );

  return {
    run:
      data?.workflow_runs_by_pk ||
      null,

    stepRuns:
      data?.step_runs || [],
  };
}