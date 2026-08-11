// ============================================================
// GET CURRENT STEP
// ============================================================

export async function getCurrentStep(
  graphqlRequest,
  workflowStepId
) {
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
      }
    }
  `;

  const data =
    await graphqlRequest(
      query,
      {
        step_id: workflowStepId,
      }
    );

  const step =
    data.workflow_steps_by_pk;

  if (!step) {
    throw new Error(
      "Workflow step not found"
    );
  }

  return step;
}

// ============================================================
// GET NEXT STEP
// ============================================================

export async function getNextStep(
  graphqlRequest,
  workflowId,
  stepOrder
) {
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
        workflow_id: workflowId,
        step_order: stepOrder,
      }
    );

  return (
    data.workflow_steps?.[0] ||
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
        step_id: stepId,
      }
    );

  const step =
    data.workflow_steps_by_pk;

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
        status
        error
        attempt_count
      }
    }
  `;

  return graphqlRequest(
    mutation,
    {
      step_id: stepRunId,
      error: errorMessage,
      attempt_count: attemptCount,
    }
  );
}

// ============================================================
// PERMANENT FAILURE
// ============================================================

export async function failExecution(
  graphqlRequest,
  stepRunId,
  workflowRunId,
  errorMessage,
  attemptCount
) {
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

  return graphqlRequest(
    mutation,
    {
      step_id: stepRunId,
      workflow_run_id: workflowRunId,
      error: errorMessage,
      attempt_count: attemptCount,
    }
  );
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

          status: "pending"

          attempt_count:
            $attempt_count

          input:
            $input
        }
      ) {
        id
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
          attemptCount,

        input,
      }
    );

  return data.insert_step_runs_one;
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
  }
) {
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
        status
        output
      }

      insert_step_runs_one(
        object: {
          workflow_run_id:
            $workflow_run_id

          workflow_step_id:
            $next_workflow_step_id

          status: "pending"

          input:
            $input
        }
      ) {
        id
        status
        input
      }
    }
  `;

  return graphqlRequest(
    mutation,
    {
      step_id: stepRunId,

      workflow_run_id:
        workflowRunId,

      next_workflow_step_id:
        nextStepId,

      output,

      input: {
        previous_output:
          output,
      },
    }
  );
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
  }
) {
  const mutation = `
    mutation CompleteWorkflow(
      $step_id: uuid!
      $workflow_run_id: uuid!
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
        status
        output
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
      }
    }
  `;

  return graphqlRequest(
    mutation,
    {
      step_id: stepRunId,

      workflow_run_id:
        workflowRunId,

      output,
    }
  );
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
        status
        output
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
      }
    }
  `;

  return graphqlRequest(
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
}

// ============================================================
// APPROVE PAUSED STEP
//
// Security:
// 1. Step must exist.
// 2. Step must be paused.
// 3. Step must actually be an approval step.
// 4. Workflow must exist.
// 5. Approver must belong to the same organization.
// 6. Approver must be owner/editor.
// 7. Approval resumes the workflow.
// ============================================================

export async function approvePausedStep(
  graphqlRequest,
  {
    stepRunId,
    userId,
  }
) {
  // ----------------------------------------------------------
  // 1. Get step run
  // ----------------------------------------------------------

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
      }
    }
  `;

  const stepRunData =
    await graphqlRequest(
      stepRunQuery,
      {
        step_id: stepRunId,
      }
    );

  const stepRun =
    stepRunData.step_runs_by_pk;

  if (!stepRun) {
    throw new Error(
      "Step run not found"
    );
  }

  if (
    step.type !==
    "approval_gate"
  ) {
    throw new Error(
      "This step is not an approval gate"
    );
  }

  // ----------------------------------------------------------
  // 2. Get workflow step
  // ----------------------------------------------------------

  const stepQuery = `
    query GetWorkflowStep(
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

  const stepData =
    await graphqlRequest(
      stepQuery,
      {
        step_id:
          stepRun.workflow_step_id,
      }
    );

  const step =
    stepData.workflow_steps_by_pk;

  if (!step) {
    throw new Error(
      "Workflow step not found"
    );
  }

  // IMPORTANT:
  // Database uses "approval", not "approval_gate".

  if (
    step.type !==
    "approval_gate"
  ) {
    throw new Error(
      "This step is not an approval gate"
    );
  }

  // ----------------------------------------------------------
  // 3. Get workflow
  // ----------------------------------------------------------

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
    workflowData.workflows_by_pk;

  if (!workflow) {
    throw new Error(
      "Workflow not found"
    );
  }

  // ----------------------------------------------------------
  // 4. Verify organization membership
  // ----------------------------------------------------------

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
    membershipData.org_members?.[0];

  if (!membership) {
    throw new Error(
      "You are not a member of this organization"
    );
  }

  // Owner/editor can approve.
  if (
    membership.role !== "owner" &&
    membership.role !== "editor"
  ) {
    throw new Error(
      "Only an owner or editor can approve this step"
    );
  }

  // ----------------------------------------------------------
  // 5. Find next step
  // ----------------------------------------------------------

  const nextStep =
    await getNextStep(
      graphqlRequest,

      step.workflow_id,

      step.step_order
    );

  // ----------------------------------------------------------
  // 6. Approval output
  // ----------------------------------------------------------

  const approvalOutput = {
    approved: true,

    approved_by:
      userId,

    approved_at:
      new Date().toISOString(),
  };

  // ----------------------------------------------------------
  // 7. Resume workflow with next step
  // ----------------------------------------------------------

  if (nextStep) {
    const mutation = `
      mutation ApproveAndContinue(
        $step_id: uuid!
        $workflow_run_id: uuid!
        $next_step_id: uuid!
        $approved_by: uuid!
        $approved_at: timestamptz!
        $output: jsonb
        $input: jsonb
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

            error: null
          }
        ) {
          id
          status
          approved_by
          approved_at
          output
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
        }

        insert_step_runs_one(
          object: {
            workflow_run_id:
              $workflow_run_id

            workflow_step_id:
              $next_step_id

            status: "pending"

            input:
              $input
          }
        ) {
          id
          status
          input
        }
      }
    `;

    return graphqlRequest(
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
          approvalOutput.approved_at,

        output:
          approvalOutput,

        input: {
          previous_output:
            approvalOutput,
        },
      }
    );
  }

  // ----------------------------------------------------------
  // 8. Approval is final workflow step
  // ----------------------------------------------------------

  const mutation = `
    mutation ApproveFinalStep(
      $step_id: uuid!
      $workflow_run_id: uuid!
      $approved_by: uuid!
      $approved_at: timestamptz!
      $output: jsonb
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

          error: null
        }
      ) {
        id
        status
        approved_by
        approved_at
        output
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
      }
    }
  `;

  return graphqlRequest(
    mutation,
    {
      step_id:
        stepRunId,

      workflow_run_id:
        stepRun.workflow_run_id,

      approved_by:
        userId,

      approved_at:
        approvalOutput.approved_at,

      output:
        approvalOutput,
    }
  );
}