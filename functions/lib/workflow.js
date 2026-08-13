// ============================================================
// GET CURRENT STEP
// ============================================================

export async function getCurrentStep(
  graphqlRequest,
  workflowStepId
) {
  if (!workflowStepId) {
    throw new Error(
      "workflowStepId is required"
    );
  }

  const query = `
    query GetCurrentStep(
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

        workflow {
          id
          org_id

          organization {
            id
          }
        }
      }
    }
  `;

  const data =
    await graphqlRequest(
      query,
      {
        step_id:
          workflowStepId,
      }
    );

  const step =
    data?.workflow_steps_by_pk;

  if (!step) {
    throw new Error(
      "Workflow step not found"
    );
  }

  return step;
}


// ============================================================
// GET WORKFLOW RUN
// ============================================================

export async function getWorkflowRun(
  graphqlRequest,
  workflowRunId
) {
  if (!workflowRunId) {
    throw new Error(
      "workflowRunId is required"
    );
  }

  const query = `
    query GetWorkflowRun(
      $run_id: uuid!
    ) {
      workflow_runs_by_pk(
        id: $run_id
      ) {
        id
        workflow_id
        status

        workflow {
          id
          org_id
        }
      }
    }
  `;

  const data =
    await graphqlRequest(
      query,
      {
        run_id:
          workflowRunId,
      }
    );

  const workflowRun =
    data?.workflow_runs_by_pk;

  if (!workflowRun) {
    throw new Error(
      "Workflow run not found"
    );
  }

  return workflowRun;
}


// ============================================================
// GET NEXT STEP
// ============================================================

export async function getNextStep(
  graphqlRequest,
  workflowId,
  stepOrder
) {
  if (!workflowId) {
    throw new Error(
      "workflowId is required"
    );
  }

  if (
    stepOrder === undefined ||
    stepOrder === null
  ) {
    throw new Error(
      "stepOrder is required"
    );
  }

  const query = `
    query GetNextStep(
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

  const data =
    await graphqlRequest(
      query,
      {
        workflow_id:
          workflowId,

        step_order:
          stepOrder,
      }
    );

  return (
    data?.workflow_steps?.[0] ||
    null
  );
}


// ============================================================
// GET NEXT STEP AFTER A SPECIFIC ORDER
// ============================================================
//
// Used for conditional branches.
//
// Example:
//
// Step 1 -> Conditional
// Step 2 -> TRUE
// Step 3 -> FALSE
// Step 4 -> Common
//
// After TRUE/FALSE branch finishes, this function can
// jump directly to Step 4 instead of executing the sibling
// branch.
//
// ============================================================

export async function getNextStepAfterOrder(
  graphqlRequest,
  workflowId,
  stepOrder
) {
  if (!workflowId) {
    throw new Error(
      "workflowId is required"
    );
  }

  if (
    stepOrder === undefined ||
    stepOrder === null
  ) {
    throw new Error(
      "stepOrder is required"
    );
  }

  const query = `
    query GetNextStepAfterOrder(
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

  const data =
    await graphqlRequest(
      query,
      {
        workflow_id:
          workflowId,

        step_order:
          stepOrder,
      }
    );

  return (
    data?.workflow_steps?.[0] ||
    null
  );
}


// ============================================================
// GET STEP BY ID
// ============================================================

export async function getStepById(
  graphqlRequest,
  stepId
) {
  if (!stepId) {
    throw new Error(
      "stepId is required"
    );
  }

  const query = `
    query GetStepById(
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

  const data =
    await graphqlRequest(
      query,
      {
        step_id:
          stepId,
      }
    );

  const step =
    data?.workflow_steps_by_pk;

  if (!step) {
    throw new Error(
      "Selected conditional branch step not found"
    );
  }

  return step;
}


// ============================================================
// MARK STEP AS FAILED
// ============================================================

export async function markStepFailed(
  graphqlRequest,
  stepRunId,
  errorMessage,
  attemptCount
) {
  if (!stepRunId) {
    throw new Error(
      "stepRunId is required"
    );
  }

  const mutation = `
    mutation MarkStepFailed(
      $step_id: uuid!
      $error: String!
      $attempt_count: Int!
    ) {
      update_step_runs_by_pk(
        pk_columns: {
          id: $step_id
        }

        _set: {
          status: "failed"
          error: $error
          attempt_count: $attempt_count
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        error
        attempt_count
      }
    }
  `;

  const data =
    await graphqlRequest(
      mutation,
      {
        step_id:
          stepRunId,

        error:
          errorMessage ||
          "Step failed",

        attempt_count:
          attemptCount ?? 0,
      }
    );

  return (
    data?.update_step_runs_by_pk ||
    null
  );
}


// ============================================================
// PERMANENT WORKFLOW FAILURE
// ============================================================

export async function failExecution(
  graphqlRequest,
  stepRunId,
  workflowRunId,
  errorMessage,
  attemptCount
) {
  if (!stepRunId) {
    throw new Error(
      "stepRunId is required"
    );
  }

  if (!workflowRunId) {
    throw new Error(
      "workflowRunId is required"
    );
  }

  const mutation = `
    mutation FailExecution(
      $step_id: uuid!
      $workflow_run_id: uuid!
      $error: String!
      $attempt_count: Int!
    ) {

      update_step_runs_by_pk(
        pk_columns: {
          id: $step_id
        }

        _set: {
          status: "failed"
          error: $error
          attempt_count: $attempt_count
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        error
        attempt_count
      }

      update_workflow_runs_by_pk(
        pk_columns: {
          id: $workflow_run_id
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

  const data =
    await graphqlRequest(
      mutation,
      {
        step_id:
          stepRunId,

        workflow_run_id:
          workflowRunId,

        error:
          errorMessage ||
          "Workflow execution failed",

        attempt_count:
          attemptCount ?? 0,
      }
    );

  return data;
}


// ============================================================
// CREATE RETRY STEP RUN
// ============================================================

export async function createRetryStepRun(
  graphqlRequest,
  {
    workflowRunId,
    workflowStepId,
    attemptCount,
    input,
  }
) {
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

  const mutation = `
    mutation CreateRetryStepRun(
      $workflow_run_id: uuid!
      $workflow_step_id: uuid!
      $attempt_count: Int!
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

          attempt_count:
            $attempt_count

          input:
            $input
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        attempt_count
        input
      }
    }
  `;

  const data =
    await graphqlRequest(
      mutation,
      {
        workflow_run_id:
          workflowRunId,

        workflow_step_id:
          workflowStepId,

        attempt_count:
          attemptCount ?? 0,

        input:
          input ?? {},
      }
    );

  const stepRun =
    data?.insert_step_runs_one;

  if (!stepRun) {
    throw new Error(
      "Retry step run could not be created"
    );
  }

  return stepRun;
}


// ============================================================
// COMPLETE CURRENT STEP + CREATE NEXT STEP
// ============================================================

export async function completeAndCreateNext(
  graphqlRequest,
  {
    stepRunId,
    workflowRunId,
    nextStepId,
    output,
    input,
  }
) {
  if (!stepRunId) {
    throw new Error(
      "stepRunId is required"
    );
  }

  if (!workflowRunId) {
    throw new Error(
      "workflowRunId is required"
    );
  }

  if (!nextStepId) {
    throw new Error(
      "nextStepId is required"
    );
  }

  const mutation = `
    mutation CompleteAndCreateNext(
      $step_id: uuid!
      $workflow_run_id: uuid!
      $next_workflow_step_id: uuid!
      $output: jsonb
      $input: jsonb
    ) {

      update_step_runs_by_pk(
        pk_columns: {
          id: $step_id
        }

        _set: {
          status: "completed"
          output: $output
          error: null
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        output
        error
      }

      insert_step_runs_one(
        object: {
          workflow_run_id:
            $workflow_run_id

          workflow_step_id:
            $next_workflow_step_id

          status:
            "pending"

          attempt_count:
            0

          input:
            $input
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        attempt_count
        input
      }
    }
  `;

  const nextInput =
    input ?? {
      previous_output:
        output ?? null,
    };

  const data =
    await graphqlRequest(
      mutation,
      {
        step_id:
          stepRunId,

        workflow_run_id:
          workflowRunId,

        next_workflow_step_id:
          nextStepId,

        output:
          output ?? null,

        input:
          nextInput,
      }
    );

  return data;
}


// ============================================================
// COMPLETE FINAL WORKFLOW
// ============================================================

export async function completeWorkflow(
  graphqlRequest,
  {
    stepRunId,
    workflowRunId,
    output,
    organizationId,
  }
) {
  if (!stepRunId) {
    throw new Error(
      "stepRunId is required to complete workflow"
    );
  }

  if (!workflowRunId) {
    throw new Error(
      "workflowRunId is required to complete workflow"
    );
  }

  if (!organizationId) {
    throw new Error(
      "Organization ID is required to complete workflow"
    );
  }

  const mutation = `
    mutation CompleteWorkflow(
      $step_id: uuid!
      $workflow_run_id: uuid!
      $organization_id: uuid!
      $output: jsonb
    ) {

      update_step_runs_by_pk(
        pk_columns: {
          id: $step_id
        }

        _set: {
          status: "completed"
          output: $output
          error: null
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        output
        error
      }

      update_workflow_runs_by_pk(
        pk_columns: {
          id: $workflow_run_id
        }

        _set: {
          status: "completed"
          error: null
        }
      ) {
        id
        status
        error
      }

      update_organizations_by_pk(
        pk_columns: {
          id: $organization_id
        }

        _inc: {
          quota_used: 1
        }
      ) {
        id
        quota_used
        quota_limit
      }
    }
  `;

  const data =
    await graphqlRequest(
      mutation,
      {
        step_id:
          stepRunId,

        workflow_run_id:
          workflowRunId,

        organization_id:
          organizationId,

        output:
          output ?? null,
      }
    );

  return data;
}


// ============================================================
// PAUSE WORKFLOW AT APPROVAL STEP
// ============================================================

export async function pauseApprovalGate(
  graphqlRequest,
  {
    stepRunId,
    workflowRunId,
    message,
  }
) {
  if (!stepRunId) {
    throw new Error(
      "stepRunId is required"
    );
  }

  if (!workflowRunId) {
    throw new Error(
      "workflowRunId is required"
    );
  }

  const mutation = `
    mutation PauseApprovalGate(
      $step_id: uuid!
      $workflow_run_id: uuid!
      $output: jsonb
    ) {

      update_step_runs_by_pk(
        pk_columns: {
          id: $step_id
        }

        _set: {
          status: "paused"
          output: $output
          error: null
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        output
        error
      }

      update_workflow_runs_by_pk(
        pk_columns: {
          id: $workflow_run_id
        }

        _set: {
          status: "paused"
          error: null
        }
      ) {
        id
        status
        error
      }
    }
  `;

  const data =
    await graphqlRequest(
      mutation,
      {
        step_id:
          stepRunId,

        workflow_run_id:
          workflowRunId,

        output: {
          status:
            "awaiting_approval",

          message:
            message ||
            "This workflow is waiting for approval.",
        },
      }
    );

  return data;
}


// ============================================================
// APPROVE PAUSED STEP
// ============================================================

export async function approvePausedStep(
  graphqlRequest,
  {
    stepRunId,
    userId,
  }
) {
  if (!stepRunId) {
    throw new Error(
      "stepRunId is required"
    );
  }

  if (!userId) {
    throw new Error(
      "userId is required"
    );
  }


  // ==========================================================
  // GET STEP RUN
  // ==========================================================

  const stepRunQuery = `
    query GetStepRun(
      $step_id: uuid!
    ) {
      step_runs_by_pk(
        id: $step_id
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        input
        output
        approved_by
        approved_at
      }
    }
  `;

  const stepRunData =
    await graphqlRequest(
      stepRunQuery,
      {
        step_id:
          stepRunId,
      }
    );

  const stepRun =
    stepRunData?.step_runs_by_pk;

  if (!stepRun) {
    throw new Error(
      "Step run not found"
    );
  }


  // ==========================================================
  // STEP MUST BE PAUSED
  // ==========================================================

  if (
    stepRun.status !==
    "paused"
  ) {
    throw new Error(
      "This step is not waiting for approval"
    );
  }


  // ==========================================================
  // GET STEP
  // ==========================================================

  const step =
    await getCurrentStep(
      graphqlRequest,
      stepRun.workflow_step_id
    );


  // ==========================================================
  // VERIFY APPROVAL GATE
  // ==========================================================

  if (
    step.type !==
    "approval_gate"
  ) {
    throw new Error(
      `This step is not an approval gate. Actual type: ${step.type}`
    );
  }


  // ==========================================================
  // GET WORKFLOW
  // ==========================================================

  const workflowQuery = `
    query GetWorkflow(
      $workflow_id: uuid!
    ) {
      workflows_by_pk(
        id: $workflow_id
      ) {
        id
        org_id
        name
      }
    }
  `;

  const workflowData =
    await graphqlRequest(
      workflowQuery,
      {
        workflow_id:
          step.workflow_id,
      }
    );

  const workflow =
    workflowData?.workflows_by_pk;

  if (!workflow) {
    throw new Error(
      "Workflow not found"
    );
  }


  // ==========================================================
  // VERIFY MEMBERSHIP
  // ==========================================================

  const membershipQuery = `
    query GetApproverMembership(
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
          workflow.org_id,

        user_id:
          userId,
      }
    );

  const membership =
    membershipData?.org_members?.[0];

  if (!membership) {
    throw new Error(
      "You are not a member of this organization"
    );
  }


  // ==========================================================
  // VERIFY ROLE
  // ==========================================================

  if (
    membership.role !== "owner" &&
    membership.role !== "editor"
  ) {
    throw new Error(
      "Only an owner or editor can approve this step"
    );
  }


  // ==========================================================
  // GET NEXT STEP
  // ==========================================================

  const nextStep =
    await getNextStep(
      graphqlRequest,
      step.workflow_id,
      step.step_order
    );


  // ==========================================================
  // APPROVAL OUTPUT
  // ==========================================================

  const approvedAt =
    new Date().toISOString();

  const approvalOutput = {
    approved: true,

    approved_by:
      userId,

    approved_at:
      approvedAt,
  };


  // ==========================================================
  // PRESERVE PREVIOUS OUTPUT
  // ==========================================================

  const previousOutput =
    stepRun.input?.previous_output ??
    null;

  const nextStepInput = {
    previous_output:
      previousOutput,

    approval:
      approvalOutput,
  };


  // ==========================================================
  // NEXT STEP EXISTS
  // ==========================================================

  if (nextStep) {

    if (
      nextStep.workflow_id !==
      step.workflow_id
    ) {
      throw new Error(
        "Next step belongs to a different workflow"
      );
    }

    const mutation = `
      mutation ApproveAndContinue(
        $step_id: uuid!
        $workflow_run_id: uuid!
        $next_step_id: uuid!
        $approved_by: uuid!
        $approved_at: timestamptz!
        $output: jsonb!
        $input: jsonb!
      ) {

        update_step_runs_by_pk(
          pk_columns: {
            id: $step_id
          }

          _set: {
            status: "completed"

            approved_by:
              $approved_by

            approved_at:
              $approved_at

            output:
              $output

            error:
              null
          }
        ) {
          id
          workflow_run_id
          workflow_step_id
          status
          approved_by
          approved_at
          output
          error
        }

        update_workflow_runs_by_pk(
          pk_columns: {
            id: $workflow_run_id
          }

          _set: {
            status: "running"
            error: null
          }
        ) {
          id
          status
          error
        }

        insert_step_runs_one(
          object: {
            workflow_run_id:
              $workflow_run_id

            workflow_step_id:
              $next_step_id

            status:
              "pending"

            attempt_count:
              0

            input:
              $input
          }
        ) {
          id
          workflow_run_id
          workflow_step_id
          status
          attempt_count
          input
        }
      }
    `;

    const result =
      await graphqlRequest(
        mutation,
        {
          step_id:
            stepRunId,

          workflow_run_id:
            stepRun.workflow_run_id,

          next_step_id:
            nextStep.id,

          approved_by:
            userId,

          approved_at:
            approvedAt,

          output:
            approvalOutput,

          input:
            nextStepInput,
        }
      );

    return {
      ...result,

      workflow_run_id:
        stepRun.workflow_run_id,

      step_run_id:
        stepRunId,

      next_step_id:
        nextStep.id,

      status:
        "running",
    };
  }


  // ==========================================================
  // FINAL APPROVAL STEP
  // ==========================================================

  const organizationId =
    workflow.org_id;

  if (!organizationId) {
    throw new Error(
      "Workflow organization ID is missing"
    );
  }

  const mutation = `
    mutation ApproveFinalStep(
      $step_id: uuid!
      $workflow_run_id: uuid!
      $organization_id: uuid!
      $approved_by: uuid!
      $approved_at: timestamptz!
      $output: jsonb!
    ) {

      update_step_runs_by_pk(
        pk_columns: {
          id: $step_id
        }

        _set: {
          status: "completed"

          approved_by:
            $approved_by

          approved_at:
            $approved_at

          output:
            $output

          error:
            null
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        approved_by
        approved_at
        output
        error
      }

      update_workflow_runs_by_pk(
        pk_columns: {
          id: $workflow_run_id
        }

        _set: {
          status: "completed"
          error: null
        }
      ) {
        id
        status
        error
      }

      update_organizations_by_pk(
        pk_columns: {
          id: $organization_id
        }

        _inc: {
          quota_used: 1
        }
      ) {
        id
        quota_used
        quota_limit
      }
    }
  `;

  const result =
    await graphqlRequest(
      mutation,
      {
        step_id:
          stepRunId,

        workflow_run_id:
          stepRun.workflow_run_id,

        organization_id:
          organizationId,

        approved_by:
          userId,

        approved_at:
          approvedAt,

        output:
          approvalOutput,
      }
    );

  return {
    ...result,

    workflow_run_id:
      stepRun.workflow_run_id,

    step_run_id:
      stepRunId,

    status:
      "completed",
  };
}