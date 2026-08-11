import {
  createGraphQLClient,
} from "./lib/graphql.js";

export default async (req, res) => {
  try {
    // ========================================================
    // 0. CORS
    // ========================================================

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

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

    // ========================================================
    // 1. GET AUTHENTICATED USER
    // ========================================================

    const userId =
      req.body?.session_variables?.[
        "x-hasura-user-id"
      ];

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authenticated user is required",
      });
    }

    console.log(
      "Authenticated user:",
      userId
    );

    // ========================================================
    // 2. GET WORKFLOW ID
    // ========================================================

    const workflowId =
      req.body?.input?.workflow_id;

    if (!workflowId) {
      return res.status(400).json({
        success: false,
        message:
          "workflow_id is required",
      });
    }

    console.log(
      "Requested workflow:",
      workflowId
    );

    // ========================================================
    // 3. ENVIRONMENT
    // ========================================================

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

    // ========================================================
    // 4. GRAPHQL CLIENT
    // ========================================================

    const graphqlRequest =
      createGraphQLClient({
        getRemainingTime:
          () => 8000,
      });

    // ========================================================
    // 5. GET WORKFLOW + ORGANIZATION
    // ========================================================

    const workflowQuery = `
      query GetWorkflow(
        $workflow_id: uuid!
      ) {
        workflows_by_pk(
          id: $workflow_id
        ) {
          id
          name
          org_id

          organization {
            id
            name
            quota_limit
            quota_used
          }
        }
      }
    `;

    const workflowData =
      await graphqlRequest(
        workflowQuery,
        {
          workflow_id:
            workflowId,
        }
      );

    const workflow =
      workflowData.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({
        success: false,
        message:
          "Workflow not found",
        workflow_id:
          workflowId,
      });
    }

    if (!workflow.organization) {
      return res.status(500).json({
        success: false,
        message:
          "Workflow organization not found",
        workflow_id:
          workflowId,
      });
    }

    console.log(
      "Organization:",
      workflow.organization.id
    );

    // ========================================================
    // 6. VERIFY USER MEMBERSHIP
    // ========================================================

    const membershipQuery = `
      query GetWorkflowMembership(
        $org_id: uuid!
        $user_id: uuid!
      ) {
        org_members(
          where: {
            org_id: {
              _eq: $org_id
            }

            user_id: {
              _eq: $user_id
            }
          }

          limit: 1
        ) {
          org_id
          user_id
          role
        }
      }
    `;

    const membershipData =
      await graphqlRequest(
        membershipQuery,
        {
          org_id:
            workflow.organization.id,

          user_id:
            userId,
        }
      );

    const membership =
      membershipData.org_members?.[0];

    if (!membership) {
      console.error(
        "User is not a member of workflow organization"
      );

      return res.status(403).json({
        success: false,
        message:
          "You do not have access to this workflow",
        workflow_id:
          workflowId,
      });
    }

    console.log(
      "User role:",
      membership.role
    );

    // ========================================================
    // 7. OWNER / EDITOR CHECK
    // ========================================================

    if (
      membership.role !== "owner" &&
      membership.role !== "editor"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only an owner or editor can trigger a workflow",
        workflow_id:
          workflowId,
        role:
          membership.role,
      });
    }

    // ========================================================
    // 8. QUOTA CHECK
    // ========================================================

    const quotaLimit =
      Number(
        workflow.organization
          .quota_limit
      );

    const quotaUsed =
      Number(
        workflow.organization
          .quota_used
      );

    console.log(
      "Quota:",
      quotaUsed,
      "/",
      quotaLimit
    );

    if (
      quotaUsed >= quotaLimit
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Organization workflow quota has been exhausted",
        workflow_id:
          workflowId,
        quota_used:
          quotaUsed,
        quota_limit:
          quotaLimit,
      });
    }

    // ========================================================
    // 9. GET WORKFLOW STEPS
    // ========================================================

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

    const stepsData =
      await graphqlRequest(
        stepsQuery,
        {
          workflow_id:
            workflowId,
        }
      );

    const steps =
      stepsData.workflow_steps || [];

    if (steps.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Workflow has no steps",
        workflow_id:
          workflowId,
      });
    }

    const firstStep =
      steps[0];

    console.log(
      "First step:",
      firstStep.name,
      firstStep.type
    );

    // ========================================================
    // 10. CREATE WORKFLOW RUN
    // ========================================================

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

    const runData =
      await graphqlRequest(
        createRunMutation,
        {
          workflow_id:
            workflowId,
        }
      );

    const run =
      runData.insert_workflow_runs_one;

    if (!run) {
      throw new Error(
        "Workflow run could not be created"
      );
    }

    console.log(
      "Workflow run created:",
      run.id
    );

    // ========================================================
    // 11. CREATE FIRST STEP RUN
    // ========================================================

    const createStepRunMutation = `
      mutation CreateStepRun(
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

            status:
              "pending"

            input:
              $input
          }
        ) {
          id
          workflow_run_id
          workflow_step_id
          status
          input
        }
      }
    `;

    let firstStepRun;

    try {
      const stepRunData =
        await graphqlRequest(
          createStepRunMutation,
          {
            workflow_run_id:
              run.id,

            workflow_step_id:
              firstStep.id,

            input: {
              previous_output:
                null,
            },
          }
        );

      firstStepRun =
        stepRunData
          .insert_step_runs_one;

    } catch (error) {

      console.error(
        "Failed to create first step run:",
        error
      );

      // ----------------------------------------------------
      // Roll workflow run back to failed
      // ----------------------------------------------------

      const failRunMutation = `
        mutation FailWorkflowRun(
          $run_id: uuid!
          $error: String!
        ) {
          update_workflow_runs_by_pk(
            pk_columns: {
              id: $run_id
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
          failRunMutation,
          {
            run_id:
              run.id,

            error:
              error?.message ||
              "Failed to create first step run",
          }
        );

      } catch (updateError) {

        console.error(
          "Failed to mark workflow run as failed:",
          updateError
        );
      }

      throw error;
    }

    // ========================================================
    // 12. RETURN ACTION RESPONSE
    //
    // IMPORTANT:
    // Hasura Action expects:
    //
    // success
    // message
    // workflow_id
    // run_id
    // status
    // step_count
    //
    // ========================================================

    console.log(
      "========================================"
    );

    console.log(
      "Workflow execution started"
    );

    console.log(
      "Workflow:",
      workflow.name
    );

    console.log(
      "Workflow ID:",
      workflowId
    );

    console.log(
      "Run ID:",
      run.id
    );

    console.log(
      "First Step Run:",
      firstStepRun.id
    );

    console.log(
      "Step Count:",
      steps.length
    );

    console.log(
      "========================================"
    );

    return res.status(200).json({

      // Required by Action
      success: true,

      // Required by Action
      message:
        "Workflow execution started",

      // Required by Action
      workflow_id:
        workflowId,

      // IMPORTANT:
      // Action expects run_id,
      // not workflow_run_id.
      run_id:
        run.id,

      // Required by Action
      status:
        "running",

      // IMPORTANT:
      // Action expects step_count.
      step_count:
        steps.length,
    });

  } catch (error) {

    console.error(
      "triggerWorkflowRun error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Internal server error",
    });
  }
};