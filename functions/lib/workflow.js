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
        step_id:
          workflowStepId,
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
        workflow_id:
          workflowId,

        step_order:
          stepOrder,
      }
    );

  return (
    data.workflow_steps?.[0] ||
    null
  );
}

// ============================================================
// FAIL STEP + WORKFLOW
// ============================================================

export async function failExecution(
  graphqlRequest,
  stepRunId,
  workflowRunId,
  errorMessage
) {
  const mutation = `
    mutation FailExecution(
      $step_id: uuid!
      $workflow_run_id: uuid!
      $error: String!
    ) {

      update_step_runs_by_pk(
        pk_columns: {
          id: $step_id
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

  await graphqlRequest(
    mutation,
    {
      step_id:
        stepRunId,

      workflow_run_id:
        workflowRunId,

      error:
        errorMessage,
    }
  );
}

// ============================================================
// COMPLETE STEP + CREATE NEXT STEP
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

          input: $input
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
      step_id:
        stepRunId,

      workflow_run_id:
        workflowRunId,

      output,
    }
  );
}
