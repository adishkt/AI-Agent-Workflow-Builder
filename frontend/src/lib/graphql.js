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

    const errors =
      response?.body?.errors;

    if (errors?.length) {
      throw new Error(
        errors[0]?.message ||
          "GraphQL request failed"
      );
    }

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
| Create Organization
|--------------------------------------------------------------------------
*/

export async function createOrganization({
  name,
}) {
  if (!name?.trim()) {
    throw new Error(
      "Organization name is required"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Get authenticated user
  |--------------------------------------------------------------------------
  */

  const userResult =
    await nhost.auth.getUser();

  if (userResult?.error) {
    throw new Error(
      userResult.error.message ||
        "Could not get current user"
    );
  }

  const user =
    userResult?.body;

  if (!user?.id) {
    throw new Error(
      "Authenticated user not found"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Create organization
  |--------------------------------------------------------------------------
  |
  | The organization table should generate the id.
  |
  */

  const organizationData =
    await request(
      `
        mutation CreateOrganization(
          $name: String!
        ) {
          insert_organizations_one(
            object: {
              name: $name
            }
          ) {
            id
            name
          }
        }
      `,
      {
        name:
          name.trim(),
      },
      "user"
    );

  const organization =
    organizationData
      ?.insert_organizations_one;

  if (!organization) {
    throw new Error(
      "Organization could not be created"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Add creator as owner
  |--------------------------------------------------------------------------
  */

  const membershipData =
    await request(
      `
        mutation CreateOwnerMembership(
          $orgId: uuid!
          $userId: uuid!
        ) {
          insert_org_members_one(
            object: {
              org_id: $orgId
              user_id: $userId
              role: "owner"
            }
          ) {
            id
            org_id
            user_id
            role
          }
        }
      `,
      {
        orgId:
          organization.id,

        userId:
          user.id,
      },
      "user"
    );

  const membership =
    membershipData
      ?.insert_org_members_one;

  if (!membership) {
    throw new Error(
      "Organization was created but owner membership could not be created"
    );
  }

  console.log(
    "ORGANIZATION CREATED:",
    organization
  );

  console.log(
    "OWNER MEMBERSHIP CREATED:",
    membership
  );

  return {
    organization,
    membership,
  };
}
/*
|--------------------------------------------------------------------------
| Get My Join Requests
|--------------------------------------------------------------------------
*/

export async function getMyJoinRequests() {
  const data = await request(
    `
      query GetMyJoinRequests {
        org_join_requests(
          order_by: {
            created_at: desc
          }
        ) {
          id
          org_id
          user_id
          status
          created_at
          updated_at
        }
      }
    `,
    {},
    "user"
  );

  return (
    data?.org_join_requests ||
    []
  );
}

/*
|--------------------------------------------------------------------------
| Search Organizations
|--------------------------------------------------------------------------
*/

export async function searchOrganizations(
  searchName
) {
  const name =
    searchName?.trim();

  if (!name) {
    return [];
  }

  const data =
    await request(
      `
        query SearchOrganizations(
          $name: String!
        ) {
          organizations(
            where: {
              name: {
                _ilike: $name
              }
            }

            limit: 20
            order_by: {
              name: asc
            }
          ) {
            id
            name
          }
        }
      `,
      {
        name: `%${name}%`,
      },
      "user"
    );

  return (
    data?.organizations ||
    []
  );
}


/*
|--------------------------------------------------------------------------
| Request To Join Organization
|--------------------------------------------------------------------------
*/

export async function requestToJoinOrganization(
  orgId
) {
  if (!orgId) {
    throw new Error(
      "Organization id is required"
    );
  }

  const userResult =
    await nhost.auth.getUser();

  if (userResult?.error) {
    throw new Error(
      userResult.error.message ||
        "Could not get current user"
    );
  }

  const user =
    userResult?.body;

  if (!user?.id) {
    throw new Error(
      "Authenticated user not found"
    );
  }

  const data =
    await request(
      `
        mutation RequestToJoinOrganization(
          $orgId: uuid!
          $userId: uuid!
        ) {
          insert_org_join_requests_one(
            object: {
              org_id: $orgId
              user_id: $userId
              status: "pending"
            }
          ) {
            id
            org_id
            user_id
            status
            created_at
            updated_at
          }
        }
      `,
      {
        orgId,
        userId: user.id,
      },
      "user"
    );

  return (
    data?.insert_org_join_requests_one ||
    null
  );
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
*/
export async function getWorkflows() {
  const membership =
    await getUserOrganization();

  console.log(
    "CURRENT ORGANIZATION ROLE:",
    membership.role
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
      "user"
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
| Reorder Workflow Step
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

  if (
    role !== "owner" &&
    role !== "editor"
  ) {
    throw new Error(
      "Only an owner or editor can trigger a workflow"
    );
  }

  console.log(
    "TRIGGER WORKFLOW:",
    workflowId
  );

  /*
  |--------------------------------------------------------------------------
  | Get workflow
  |--------------------------------------------------------------------------
  */

  const workflowData =
    await request(
      `
        query GetWorkflowForRun(
          $workflowId: uuid!
        ) {
          workflows_by_pk(
            id: $workflowId
          ) {
            id
            org_id
            name
            description

            organization {
              id
              name
              quota_limit
              quota_used
            }
          }
        }
      `,
      {
        workflowId,
      },
      role
    );

  const workflow =
    workflowData?.workflows_by_pk;

  if (!workflow) {
    throw new Error(
      "Workflow not found"
    );
  }

  if (!workflow.organization) {
    throw new Error(
      "Workflow organization not found"
    );
  }

  const quotaLimit =
    Number(
      workflow.organization.quota_limit
    );

  const quotaUsed =
    Number(
      workflow.organization.quota_used
    );

  if (
    Number.isFinite(quotaLimit) &&
    Number.isFinite(quotaUsed) &&
    quotaUsed >= quotaLimit
  ) {
    throw new Error(
      "Organization workflow quota has been exhausted"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Get workflow steps
  |--------------------------------------------------------------------------
  */

  const stepsData =
    await request(
      `
        query GetWorkflowStepsForRun(
          $workflowId: uuid!
        ) {
          workflow_steps(
            where: {
              workflow_id: {
                _eq: $workflowId
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
      `,
      {
        workflowId,
      },
      role
    );

  const steps =
    stepsData?.workflow_steps || [];

  if (!steps.length) {
    throw new Error(
      "Workflow has no steps"
    );
  }

  const firstStep =
    steps[0];

  /*
  |--------------------------------------------------------------------------
  | Create Workflow Run
  |--------------------------------------------------------------------------
  */

  const runData =
    await request(
      `
        mutation CreateWorkflowRun(
          $workflowId: uuid!
          $startedAt: timestamptz!
        ) {
          insert_workflow_runs_one(
            object: {
              workflow_id: $workflowId
              status: "running"
              started_at: $startedAt
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
      `,
      {
        workflowId,

        startedAt:
          new Date().toISOString(),
      },
      role
    );

  const workflowRun =
    runData?.insert_workflow_runs_one;

  if (!workflowRun) {
    throw new Error(
      "Workflow run could not be created"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Create First Step Run
  |--------------------------------------------------------------------------
  */

  try {
    const stepRunData =
      await request(
        `
          mutation CreateFirstStepRun(
            $workflowRunId: uuid!
            $workflowStepId: uuid!
            $input: jsonb!
          ) {
            insert_step_runs_one(
              object: {
                workflow_run_id: $workflowRunId
                workflow_step_id: $workflowStepId
                status: "pending"
                input: $input
                attempt_count: 0
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
          workflowRunId:
            workflowRun.id,

          workflowStepId:
            firstStep.id,

          input: {
            previous_output:
              null,
          },
        },
        role
      );

    const firstStepRun =
      stepRunData?.insert_step_runs_one;

    if (!firstStepRun) {
      throw new Error(
        "First step run could not be created"
      );
    }

    return {
      success: true,

      message:
        "Workflow execution started",

      workflow_id:
        workflow.id,

      run_id:
        workflowRun.id,

      status:
        workflowRun.status,

      step_count:
        steps.length,

      first_step_run_id:
        firstStepRun.id,
    };

  } catch (error) {

    try {
      await request(
        `
          mutation FailWorkflowRun(
            $runId: uuid!
            $error: String!
          ) {
            update_workflow_runs_by_pk(
              pk_columns: {
                id: $runId
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
        `,
        {
          runId:
            workflowRun.id,

          error:
            error?.message ||
            "Failed to create first step run",
        },
        role
      );
    } catch (updateError) {
      console.error(
        "Failed to mark workflow run as failed:",
        updateError
      );
    }

    throw error;
  }
}


/*
|--------------------------------------------------------------------------
| Approve Approval Gate
|--------------------------------------------------------------------------
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
| Workflow Run Management
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Get Workflow Runs
|--------------------------------------------------------------------------
*/

export async function getWorkflowRuns(
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
    "GET WORKFLOW RUNS ROLE:",
    role
  );

  const data =
    await request(
      `
        query GetWorkflowRuns(
          $workflowId: uuid!
        ) {
          workflow_runs(
            where: {
              workflow_id: {
                _eq: $workflowId
              }
            }

            order_by: {
              started_at: desc
            }
          ) {
            id
            workflow_id
            status
            started_at
            completed_at
            error

            step_runs {
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
        }
      `,
      {
        workflowId,
      },
      role
    );

  return (
    data?.workflow_runs ||
    []
  );
}


/*
|--------------------------------------------------------------------------
| Get Single Workflow Run
|--------------------------------------------------------------------------
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

            step_runs {
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
        }
      `,
      {
        runId,
      },
      role
    );

  return (
    data?.workflow_runs_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Update Workflow Run
|--------------------------------------------------------------------------
*/

export async function updateWorkflowRun({
  id,
  status,
  startedAt,
  completedAt,
  error,
}) {
  if (!id) {
    throw new Error(
      "Workflow run id is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation UpdateWorkflowRun(
          $id: uuid!
          $status: String
          $startedAt: timestamptz
          $completedAt: timestamptz
          $error: String
        ) {
          update_workflow_runs_by_pk(
            pk_columns: {
              id: $id
            }

            _set: {
              status: $status
              started_at: $startedAt
              completed_at: $completedAt
              error: $error
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
      `,
      {
        id,
        status:
          status ?? null,
        startedAt:
          startedAt ?? null,
        completedAt:
          completedAt ?? null,
        error:
          error ?? null,
      },
      role
    );

  return (
    data?.update_workflow_runs_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Delete Workflow Run
|--------------------------------------------------------------------------
*/

export async function deleteWorkflowRun(
  id
) {
  if (!id) {
    throw new Error(
      "Workflow run id is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation DeleteWorkflowRun(
          $id: uuid!
        ) {
          delete_workflow_runs_by_pk(
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
    data?.delete_workflow_runs_by_pk ||
    null
  );
}
/*
|--------------------------------------------------------------------------
| Step Run Management
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Create Step Run
|--------------------------------------------------------------------------
*/

export async function createStepRun({
  workflowRunId,
  workflowStepId,
  status = "pending",
  input = {},
  attemptCount = 0,
}) {
  if (!workflowRunId) {
    throw new Error(
      "workflowRunId is required"
    );
  }

  if (!workflowStepId) {
    throw new Error(
      "workflowStepId is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation CreateStepRun(
          $workflowRunId: uuid!
          $workflowStepId: uuid!
          $status: String!
          $input: jsonb!
          $attemptCount: Int!
        ) {
          insert_step_runs_one(
            object: {
              workflow_run_id: $workflowRunId
              workflow_step_id: $workflowStepId
              status: $status
              input: $input
              attempt_count: $attemptCount
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
        workflowRunId,
        workflowStepId,
        status,
        input:
          input ?? {},
        attemptCount,
      },
      role
    );

  return (
    data?.insert_step_runs_one ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Get Step Run
|--------------------------------------------------------------------------
*/

export async function getStepRun(
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

  const data =
    await request(
      `
        query GetStepRun(
          $stepRunId: uuid!
        ) {
          step_runs_by_pk(
            id: $stepRunId
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
        stepRunId,
      },
      role
    );

  return (
    data?.step_runs_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Get Step Runs For Workflow Run
|--------------------------------------------------------------------------
*/

export async function getStepRuns(
  workflowRunId
) {
  if (!workflowRunId) {
    throw new Error(
      "workflowRunId is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        query GetStepRuns(
          $workflowRunId: uuid!
        ) {
          step_runs(
            where: {
              workflow_run_id: {
                _eq: $workflowRunId
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
        workflowRunId,
      },
      role
    );

  return (
    data?.step_runs ||
    []
  );
}


/*
|--------------------------------------------------------------------------
| Update Step Run
|--------------------------------------------------------------------------
*/

export async function updateStepRun({
  id,
  status,
  input,
  output,
  error,
  attemptCount,
  approvedBy,
  approvedAt,
}) {
  if (!id) {
    throw new Error(
      "Step run id is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation UpdateStepRun(
          $id: uuid!
          $status: String
          $input: jsonb
          $output: jsonb
          $error: String
          $attemptCount: Int
          $approvedBy: uuid
          $approvedAt: timestamptz
        ) {
          update_step_runs_by_pk(
            pk_columns: {
              id: $id
            }

            _set: {
              status: $status
              input: $input
              output: $output
              error: $error
              attempt_count: $attemptCount
              approved_by: $approvedBy
              approved_at: $approvedAt
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
        id,
        status:
          status ?? null,
        input:
          input ?? null,
        output:
          output ?? null,
        error:
          error ?? null,
        attemptCount:
          attemptCount ?? null,
        approvedBy:
          approvedBy ?? null,
        approvedAt:
          approvedAt ?? null,
      },
      role
    );

  return (
    data?.update_step_runs_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Delete Step Run
|--------------------------------------------------------------------------
*/

export async function deleteStepRun(
  id
) {
  if (!id) {
    throw new Error(
      "Step run id is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  const data =
    await request(
      `
        mutation DeleteStepRun(
          $id: uuid!
        ) {
          delete_step_runs_by_pk(
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
    data?.delete_step_runs_by_pk ||
    null
  );
}
/*
|--------------------------------------------------------------------------
| Workflow Trigger Management
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Create Workflow Trigger
|--------------------------------------------------------------------------
*/

export async function createWorkflowTrigger({
  workflowId,
  type,
  config = {},
  enabled = true,
}) {
  if (!workflowId) {
    throw new Error(
      "workflowId is required"
    );
  }

  if (!type?.trim()) {
    throw new Error(
      "Trigger type is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  if (
    role !== "owner" &&
    role !== "editor"
  ) {
    throw new Error(
      "Only an owner or editor can create a workflow trigger"
    );
  }

  const data =
    await request(
      `
        mutation CreateWorkflowTrigger(
          $workflowId: uuid!
          $type: String!
          $config: jsonb!
          $enabled: Boolean!
        ) {
          insert_workflow_triggers_one(
            object: {
              workflow_id: $workflowId
              type: $type
              config: $config
              enabled: $enabled
            }
          ) {
            id
            workflow_id
            type
            config
            enabled
          }
        }
      `,
      {
        workflowId,
        type,
        config:
          config ?? {},
        enabled,
      },
      role
    );

  return (
    data?.insert_workflow_triggers_one ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Get Workflow Triggers
|--------------------------------------------------------------------------
*/

export async function getWorkflowTriggers(
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

  const data =
    await request(
      `
        query GetWorkflowTriggers(
          $workflowId: uuid!
        ) {
          workflow_triggers(
            where: {
              workflow_id: {
                _eq: $workflowId
              }
            }
          ) {
            id
            workflow_id
            type
            config
            enabled
          }
        }
      `,
      {
        workflowId,
      },
      role
    );

  return (
    data?.workflow_triggers ||
    []
  );
}


/*
|--------------------------------------------------------------------------
| Update Workflow Trigger
|--------------------------------------------------------------------------
*/

export async function updateWorkflowTrigger({
  id,
  type,
  config = {},
  enabled = true,
}) {
  if (!id) {
    throw new Error(
      "Trigger id is required"
    );
  }

  if (!type?.trim()) {
    throw new Error(
      "Trigger type is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  if (
    role !== "owner" &&
    role !== "editor"
  ) {
    throw new Error(
      "Only an owner or editor can update a workflow trigger"
    );
  }

  const data =
    await request(
      `
        mutation UpdateWorkflowTrigger(
          $id: uuid!
          $type: String!
          $config: jsonb!
          $enabled: Boolean!
        ) {
          update_workflow_triggers_by_pk(
            pk_columns: {
              id: $id
            }

            _set: {
              type: $type
              config: $config
              enabled: $enabled
            }
          ) {
            id
            workflow_id
            type
            config
            enabled
          }
        }
      `,
      {
        id,
        type,
        config:
          config ?? {},
        enabled,
      },
      role
    );

  return (
    data?.update_workflow_triggers_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Toggle Workflow Trigger
|--------------------------------------------------------------------------
*/

export async function toggleWorkflowTrigger({
  id,
  enabled,
}) {
  if (!id) {
    throw new Error(
      "Trigger id is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  if (
    role !== "owner" &&
    role !== "editor"
  ) {
    throw new Error(
      "Only an owner or editor can change a workflow trigger"
    );
  }

  const data =
    await request(
      `
        mutation ToggleWorkflowTrigger(
          $id: uuid!
          $enabled: Boolean!
        ) {
          update_workflow_triggers_by_pk(
            pk_columns: {
              id: $id
            }

            _set: {
              enabled: $enabled
            }
          ) {
            id
            workflow_id
            type
            config
            enabled
          }
        }
      `,
      {
        id,
        enabled:
          Boolean(enabled),
      },
      role
    );

  return (
    data?.update_workflow_triggers_by_pk ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| Delete Workflow Trigger
|--------------------------------------------------------------------------
*/

export async function deleteWorkflowTrigger(
  id
) {
  if (!id) {
    throw new Error(
      "Trigger id is required"
    );
  }

  const membership =
    await getUserOrganization();

  const role =
    membership.role;

  if (
    role !== "owner" &&
    role !== "editor"
  ) {
    throw new Error(
      "Only an owner or editor can delete a workflow trigger"
    );
  }

  const data =
    await request(
      `
        mutation DeleteWorkflowTrigger(
          $id: uuid!
        ) {
          delete_workflow_triggers_by_pk(
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
    data?.delete_workflow_triggers_by_pk ||
    null
  );
}
