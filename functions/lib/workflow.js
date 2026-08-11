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
// GET STEP BY ID
//
// Used by conditional_branch to select the true/false step.
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
        step_id:
          stepId,
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
// GET NEXT STEP
//
// Normal sequential execution uses step_order.
// Conditional branches can override this using getStepById().
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
// MARK STEP AS FAILED
//
// This only marks the current step as failed.
// The workflow remains running when a retry will be created.
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
      step_id:
        stepRunId,

      error:
        errorMessage,

      attempt_count:
        attemptCount,
    }
  );
}


// ============================================================
// PERMANENT FAILURE
//
// Used after all retries are exhausted.
// Marks BOTH step and workflow as failed.
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
      step_id:
        stepRunId,

      workflow_run_id:
        workflowRunId,

      error:
        errorMessage,

      attempt_count:
        attemptCount,
    }
  );
}


// ============================================================
// CREATE RETRY STEP RUN
//
// INSERT is intentional because Hasura listens for INSERT
// events on step_runs.
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