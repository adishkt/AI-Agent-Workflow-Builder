function getValue(input, path) {
  if (!path) {
    return undefined;
  }

  return path
    .split(".")
    .reduce(
      (value, key) => value?.[key],
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
   *   "field": "text",
   *   "operator": "contains",
   *   "value": "Personalized",
   *   "true_step_id": "...",
   *   "false_step_id": "..."
   * }
   */

  // ==========================================================
  // 1. GET ACTUAL VALUE
  // ==========================================================

  const actual =
    getValue(
      previousOutput,
      config.field
    );

  // ==========================================================
  // 2. GET EXPECTED VALUE
  // ==========================================================

  const expected =
    config.value;

  // ==========================================================
  // 3. GET OPERATOR
  // ==========================================================

  const operator =
    config.operator || "eq";

  let result = false;

  // ==========================================================
  // 4. EVALUATE CONDITION
  // ==========================================================

  switch (operator) {

    // --------------------------------------------------------
    // EQUAL
    // --------------------------------------------------------

    case "eq":
      result =
        actual === expected;
      break;

    // --------------------------------------------------------
    // NOT EQUAL
    // --------------------------------------------------------

    case "neq":
      result =
        actual !== expected;
      break;

    // --------------------------------------------------------
    // GREATER THAN
    // --------------------------------------------------------

    case "gt":
      result =
        Number(actual) >
        Number(expected);
      break;

    // --------------------------------------------------------
    // GREATER THAN OR EQUAL
    // --------------------------------------------------------

    case "gte":
      result =
        Number(actual) >=
        Number(expected);
      break;

    // --------------------------------------------------------
    // LESS THAN
    // --------------------------------------------------------

    case "lt":
      result =
        Number(actual) <
        Number(expected);
      break;

    // --------------------------------------------------------
    // LESS THAN OR EQUAL
    // --------------------------------------------------------

    case "lte":
      result =
        Number(actual) <=
        Number(expected);
      break;

    // --------------------------------------------------------
    // CONTAINS
    // --------------------------------------------------------

    case "contains":
      result =
        String(actual ?? "")
          .includes(
            String(expected ?? "")
          );
      break;

    // --------------------------------------------------------
    // TRUTHY
    // --------------------------------------------------------

    case "truthy":
      result =
        Boolean(actual);
      break;

    // --------------------------------------------------------
    // UNSUPPORTED OPERATOR
    // --------------------------------------------------------

    default:
      throw new Error(
        `Unsupported conditional operator: ${operator}`
      );
  }

  // ==========================================================
  // 5. GET BOTH BRANCHES
  // ==========================================================

  const trueStepId =
    config.true_step_id ||
    null;

  const falseStepId =
    config.false_step_id ||
    null;

  // ==========================================================
  // 6. SELECT BRANCH
  // ==========================================================

  const selectedStepId =
    result
      ? trueStepId
      : falseStepId;

  // ==========================================================
  // 7. MAKE SURE SELECTED BRANCH EXISTS
  // ==========================================================

  if (!selectedStepId) {
    throw new Error(
      `Conditional step "${step.name}" evaluated to ${result}, but the ${
        result
          ? "true"
          : "false"
      } branch has no step ID`
    );
  }

  // ==========================================================
  // 8. LOG CONDITION
  // ==========================================================

  console.log(
    "========================================"
  );

  console.log(
    "CONDITIONAL STEP"
  );

  console.log(
    "Step:",
    step.name
  );

  console.log(
    "Field:",
    config.field
  );

  console.log(
    "Actual:",
    actual
  );

  console.log(
    "Expected:",
    expected
  );

  console.log(
    "Operator:",
    operator
  );

  console.log(
    "Result:",
    result
  );

  console.log(
    "True step:",
    trueStepId
  );

  console.log(
    "False step:",
    falseStepId
  );

  console.log(
    "Selected step:",
    selectedStepId
  );

  console.log(
    "========================================"
  );

  // ==========================================================
  // 9. RETURN CONDITION RESULT
  // ==========================================================

  return {
    result,

    actual,

    expected,

    operator,

    true_step_id:
      trueStepId,

    false_step_id:
      falseStepId,

    selected_step_id:
      selectedStepId,
  };
}