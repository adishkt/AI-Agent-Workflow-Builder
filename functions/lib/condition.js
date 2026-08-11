function getValue(
  input,
  path
) {
  if (!path) {
    return undefined;
  }

  return path
    .split(".")
    .reduce(
      (value, key) =>
        value?.[key],
      input
    );
}

export function executeConditionalStep(
  step,
  stepInput
) {
  const config =
    step.config || {};

  const previousOutput =
    stepInput?.previous_output;

  /*
   * Supported configuration:
   *
   * {
   *   "field": "score",
   *   "operator": "gt",
   *   "value": 0.5,
   *   "true_step_id": "...",
   *   "false_step_id": "..."
   * }
   */

  const actual =
    getValue(
      previousOutput,
      config.field
    );

  const expected =
    config.value;

  const operator =
    config.operator || "eq";

  let result = false;

  switch (operator) {
    case "eq":
      result =
        actual === expected;
      break;

    case "neq":
      result =
        actual !== expected;
      break;

    case "gt":
      result =
        Number(actual) >
        Number(expected);
      break;

    case "gte":
      result =
        Number(actual) >=
        Number(expected);
      break;

    case "lt":
      result =
        Number(actual) <
        Number(expected);
      break;

    case "lte":
      result =
        Number(actual) <=
        Number(expected);
      break;

    case "contains":
      result =
        String(actual ?? "")
          .includes(
            String(expected)
          );
      break;

    case "truthy":
      result = Boolean(actual);
      break;

    default:
      throw new Error(
        `Unsupported conditional operator: ${operator}`
      );
  }

  return {
    result,
    actual,
    expected,
    operator,
    true_step_id:
      config.true_step_id || null,
    false_step_id:
      config.false_step_id || null,
  };
}
