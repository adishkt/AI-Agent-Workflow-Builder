export async function executeDbWriteStep(
  graphqlRequest,
  stepRunId,
  stepInput
) {
  const config = stepInput?.db_write_config || {};

  const value =
    stepInput?.previous_output ??
    config.value ??
    null;

  const mutation = `
    mutation WriteStepResult(
      $step_id: uuid!
      $output: jsonb
    ) {
      update_step_runs_by_pk(
        pk_columns: {
          id: $step_id
        }
        _set: {
          output: $output
        }
      ) {
        id
        output
      }
    }
  `;

  const data =
    await graphqlRequest(
      mutation,
      {
        step_id: stepRunId,
        output: value,
      }
    );

  const result =
    data.update_step_runs_by_pk;

  if (!result) {
    throw new Error(
      "Failed to save db_write result"
    );
  }

  return {
    saved: true,
    step_run_id: result.id,
    output: result.output,
  };
}
