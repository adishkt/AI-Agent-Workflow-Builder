import {
  useEffect,
  useState,
} from "react";

import {
  createWorkflowStep,
  updateWorkflowStep,
  getWorkflow,
} from "../../lib/graphql";


function WorkflowStepForm({
  workflowId,
  nextStepOrder,
  editingStep = null,
  onCreated,
  onUpdated,
  onCancel,
}) {

  const isEditing =
    Boolean(editingStep);


  // ==========================================================
  // STEP NAME
  // ==========================================================

  const [name, setName] =
    useState(
      editingStep?.name || ""
    );


  // ==========================================================
  // STEP TYPE
  // ==========================================================

  const [type, setType] =
    useState(
      editingStep?.type || "llm"
    );


  // ==========================================================
  // NORMAL JSON CONFIGURATION
  // ==========================================================

  const [config, setConfig] =
    useState(
      editingStep
        ? JSON.stringify(
            editingStep.config || {},
            null,
            2
          )
        : `{
  "model": "openai/gpt-4o-mini",
  "prompt": "",
  "max_tokens": 120
}`
    );


  // ==========================================================
  // WORKFLOW STEPS
  // ==========================================================

  const [workflowSteps, setWorkflowSteps] =
    useState([]);


  const [stepsLoading, setStepsLoading] =
    useState(false);


  // ==========================================================
  // CONDITIONAL BRANCH CONFIG
  // ==========================================================

  const existingConditionalConfig =
    editingStep?.type ===
      "conditional_branch"
      ? editingStep?.config || {}
      : {};


  const [conditionField, setConditionField] =
    useState(
      existingConditionalConfig.field ||
      "text"
    );


  const [conditionOperator, setConditionOperator] =
    useState(
      existingConditionalConfig.operator ||
      "contains"
    );


  const [conditionValue, setConditionValue] =
    useState(
      existingConditionalConfig.value ||
      ""
    );


  const [trueStepId, setTrueStepId] =
    useState(
      existingConditionalConfig.true_step_id ||
      ""
    );


  const [falseStepId, setFalseStepId] =
    useState(
      existingConditionalConfig.false_step_id ||
      ""
    );


  // ==========================================================
  // STATE
  // ==========================================================

  const [loading, setLoading] =
    useState(false);


  const [error, setError] =
    useState("");


  // ==========================================================
  // LOAD WORKFLOW STEPS
  // ==========================================================

  useEffect(() => {

    let cancelled = false;


    async function loadWorkflowSteps() {

      if (!workflowId) {
        return;
      }


      /*
       * We only need the workflow steps for
       * the conditional branch selectors.
       */

      setStepsLoading(true);


      try {

        const workflow =
          await getWorkflow(
            workflowId
          );


        if (cancelled) {
          return;
        }


        const steps =
          workflow?.workflow_steps ||
          [];


        /*
         * Never allow the conditional step
         * to point to itself.
         */

        const availableSteps =
          steps.filter(
            (step) =>
              step.id !==
              editingStep?.id
          );


        setWorkflowSteps(
          availableSteps
        );


      } catch (err) {

        if (cancelled) {
          return;
        }


        console.error(
          "Failed to load workflow steps:",
          err
        );


        setError(
          err?.message ||
            "Could not load workflow steps"
        );

      } finally {

        if (!cancelled) {
          setStepsLoading(false);
        }

      }
    }


    loadWorkflowSteps();


    return () => {
      cancelled = true;
    };

  }, [
    workflowId,
    editingStep?.id,
  ]);


  // ==========================================================
  // SUBMIT
  // ==========================================================

  const handleSubmit = async (
    e
  ) => {

    e.preventDefault();

    setError("");


    // --------------------------------------------------------
    // Validate name
    // --------------------------------------------------------

    if (!name.trim()) {

      setError(
        "Step name is required"
      );

      return;
    }


    // --------------------------------------------------------
    // Build configuration
    // --------------------------------------------------------

    let parsedConfig;


    /*
     * CONDITIONAL BRANCH
     *
     * We don't ask the user to manually
     * enter UUIDs anymore.
     */

    if (
      type ===
      "conditional_branch"
    ) {

      if (
        !conditionField.trim()
      ) {

        setError(
          "Condition field is required"
        );

        return;
      }


      if (
        !conditionValue.trim()
      ) {

        setError(
          "Condition value is required"
        );

        return;
      }


      if (!trueStepId) {

        setError(
          "Please select the TRUE branch step"
        );

        return;
      }


      if (!falseStepId) {

        setError(
          "Please select the FALSE branch step"
        );

        return;
      }


      if (
        trueStepId ===
        falseStepId
      ) {

        setError(
          "TRUE and FALSE branches must use different steps"
        );

        return;
      }


      parsedConfig = {

        field:
          conditionField.trim(),

        operator:
          conditionOperator,

        value:
          conditionValue.trim(),

        true_step_id:
          trueStepId,

        false_step_id:
          falseStepId,

      };

    }


    // --------------------------------------------------------
    // NORMAL JSON CONFIG
    // --------------------------------------------------------

    else {

      try {

        parsedConfig =
          JSON.parse(config);

      } catch (err) {

        setError(
          "Configuration must be valid JSON"
        );

        return;
      }


      // ------------------------------------------------------
      // LLM validation
      // ------------------------------------------------------

      if (
        type === "llm" &&
        (
          !parsedConfig.prompt ||
          !String(
            parsedConfig.prompt
          ).trim()
        )
      ) {

        setError(
          "LLM prompt is required. Please enter a prompt."
        );

        return;
      }

    }


    // --------------------------------------------------------
    // Save
    // --------------------------------------------------------

    try {

      setLoading(true);


      // ======================================================
      // EDIT EXISTING STEP
      // ======================================================

      if (isEditing) {

        const updatedStep =
          await updateWorkflowStep({

            id:
              editingStep.id,

            stepOrder:
              editingStep.step_order,

            name:
              name.trim(),

            type,

            config:
              parsedConfig,

          });


        console.log(
          "Workflow step updated:",
          updatedStep
        );


        if (onUpdated) {

          onUpdated(
            updatedStep
          );

        }

        return;
      }


      // ======================================================
      // CREATE NEW STEP
      // ======================================================

      const newStep =
        await createWorkflowStep({

          workflowId,

          stepOrder:
            nextStepOrder,

          name:
            name.trim(),

          type,

          config:
            parsedConfig,

        });


      console.log(
        "Workflow step created:",
        newStep
      );


      if (onCreated) {

        onCreated(
          newStep
        );

      }

    } catch (err) {

      console.error(
        "Failed to save workflow step:",
        err
      );


      setError(
        err?.message ||
          "Failed to save workflow step"
      );

    } finally {

      setLoading(false);

    }
  };


  // ==========================================================
  // DEFAULT CONFIGURATION
  // ==========================================================

  const handleTypeChange = (
    newType
  ) => {

    setType(newType);


    /*
     * When editing, don't automatically
     * overwrite an existing configuration.
     *
     * Conditional values are handled by
     * the dedicated UI below.
     */

    if (isEditing) {

      /*
       * If switching INTO conditional mode
       * while editing a different type,
       * initialize sensible defaults.
       */

      if (
        newType ===
        "conditional_branch"
      ) {

        setConditionField(
          "text"
        );

        setConditionOperator(
          "contains"
        );

        setConditionValue(
          ""
        );

        setTrueStepId(
          ""
        );

        setFalseStepId(
          ""
        );
      }

      return;
    }


    // ========================================================
    // LLM
    // ========================================================

    if (
      newType ===
      "llm"
    ) {

      setConfig(`{
  "model": "openai/gpt-4o-mini",
  "prompt": "",
  "max_tokens": 120
}`);

    }


    // ========================================================
    // HTTP
    // ========================================================

    else if (
      newType ===
      "http_request"
    ) {

      setConfig(`{
  "url": "",
  "method": "GET",
  "headers": {},
  "body": {}
}`);

    }


    // ========================================================
    // DATABASE WRITE
    // ========================================================

    else if (
      newType ===
      "db_write"
    ) {

      setConfig(`{
  "table": "",
  "data": {}
}`);

    }


    // ========================================================
    // CONDITIONAL BRANCH
    // ========================================================

    else if (
      newType ===
      "conditional_branch"
    ) {

      /*
       * Clear old JSON config.
       *
       * The actual conditional config is now
       * generated automatically on submit.
       */

      setConditionField(
        "text"
      );

      setConditionOperator(
        "contains"
      );

      setConditionValue(
        ""
      );

      setTrueStepId(
        ""
      );

      setFalseStepId(
        ""
      );

    }


    // ========================================================
    // APPROVAL GATE
    // ========================================================

    else if (
      newType ===
      "approval_gate"
    ) {

      setConfig(`{
  "message": "Approval required"
}`);

    }

  };


  // ==========================================================
  // GET STEP NAME
  // ==========================================================

  const getStepDisplayName = (
    step
  ) => {

    if (!step) {
      return "";
    }


    return (
      step.name ||
      `${step.type} - Step ${step.step_order}`
    );
  };


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="workflow-step-form">

      {/* ==================================================== */}
      {/* TITLE */}
      {/* ==================================================== */}

      <h3>
        {isEditing
          ? "Edit Workflow Step"
          : "Add Workflow Step"}
      </h3>


      <form
        onSubmit={
          handleSubmit
        }
      >


        {/* ================================================== */}
        {/* STEP NAME */}
        {/* ================================================== */}

        <div>

          <label>
            Step name
          </label>

          <input
            type="text"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
              )
            }
            placeholder="e.g. Generate AI Response"
            disabled={loading}
            required
          />

        </div>


        {/* ================================================== */}
        {/* STEP TYPE */}
        {/* ================================================== */}

        <div>

          <label>
            Step type
          </label>

          <select
            value={type}
            onChange={(e) =>
              handleTypeChange(
                e.target.value
              )
            }
            disabled={loading}
          >

            <option value="llm">
              LLM
            </option>

            <option value="http_request">
              HTTP Request
            </option>

            <option value="db_write">
              Database Write
            </option>

            <option value="conditional_branch">
              Conditional Branch
            </option>

            <option value="approval_gate">
              Approval Gate
            </option>

          </select>

        </div>


        {/* ================================================== */}
        {/* CONDITIONAL BRANCH UI */}
        {/* ================================================== */}

        {type ===
          "conditional_branch" && (

          <div className="conditional-config">

            {/* ============================================== */}
            {/* FIELD */}
            {/* ============================================== */}

            <div>

              <label>
                Field
              </label>

              <input
                type="text"
                value={
                  conditionField
                }
                onChange={(e) =>
                  setConditionField(
                    e.target.value
                  )
                }
                placeholder="e.g. text"
                disabled={
                  loading
                }
              />

              <small>
                Field from the previous
                step output to evaluate.
              </small>

            </div>


            {/* ============================================== */}
            {/* OPERATOR */}
            {/* ============================================== */}

            <div>

              <label>
                Operator
              </label>

              <select
                value={
                  conditionOperator
                }
                onChange={(e) =>
                  setConditionOperator(
                    e.target.value
                  )
                }
                disabled={
                  loading
                }
              >

                <option value="contains">
                  contains
                </option>

                <option value="equals">
                  equals
                </option>

                <option value="not_equals">
                  not equals
                </option>

                <option value="starts_with">
                  starts with
                </option>

                <option value="ends_with">
                  ends with
                </option>

              </select>

            </div>


            {/* ============================================== */}
            {/* VALUE */}
            {/* ============================================== */}

            <div>

              <label>
                Expected value
              </label>

              <input
                type="text"
                value={
                  conditionValue
                }
                onChange={(e) =>
                  setConditionValue(
                    e.target.value
                  )
                }
                placeholder="e.g. AI"
                disabled={
                  loading
                }
              />

            </div>


            {/* ============================================== */}
            {/* TRUE STEP */}
            {/* ============================================== */}

            <div>

              <label>
                If condition is TRUE
              </label>

              <select
                value={
                  trueStepId
                }
                onChange={(e) =>
                  setTrueStepId(
                    e.target.value
                  )
                }
                disabled={
                  loading ||
                  stepsLoading
                }
              >

                <option value="">
                  {stepsLoading
                    ? "Loading steps..."
                    : "Select TRUE step"}
                </option>


                {workflowSteps.map(
                  (step) => (

                    <option
                      key={
                        step.id
                      }
                      value={
                        step.id
                      }
                    >
                      {getStepDisplayName(
                        step
                      )}
                      {" "}
                      (Step{" "}
                      {
                        step.step_order
                      }
                      )
                    </option>

                  )
                )}

              </select>

              <small>
                This step will run when
                the condition matches.
              </small>

            </div>


            {/* ============================================== */}
            {/* FALSE STEP */}
            {/* ============================================== */}

            <div>

              <label>
                If condition is FALSE
              </label>

              <select
                value={
                  falseStepId
                }
                onChange={(e) =>
                  setFalseStepId(
                    e.target.value
                  )
                }
                disabled={
                  loading ||
                  stepsLoading
                }
              >

                <option value="">
                  {stepsLoading
                    ? "Loading steps..."
                    : "Select FALSE step"}
                </option>


                {workflowSteps.map(
                  (step) => (

                    <option
                      key={
                        step.id
                      }
                      value={
                        step.id
                      }
                    >
                      {getStepDisplayName(
                        step
                      )}
                      {" "}
                      (Step{" "}
                      {
                        step.step_order
                      }
                      )
                    </option>

                  )
                )}

              </select>

              <small>
                This step will run when
                the condition does not match.
              </small>

            </div>


            {/* ============================================== */}
            {/* HELP */}
            {/* ============================================== */}

            <div>

              <p>
                <strong>
                  Branch configuration:
                </strong>
              </p>

              <p>
                The selected TRUE and FALSE
                step IDs are saved automatically.
                You do not need to copy UUIDs.
              </p>

            </div>

          </div>

        )}


        {/* ================================================== */}
        {/* NORMAL JSON CONFIGURATION */}
        {/* ================================================== */}

        {type !==
          "conditional_branch" && (

          <div>

            <label>
              Configuration (JSON)
            </label>

            <textarea
              value={config}
              onChange={(e) =>
                setConfig(
                  e.target.value
                )
              }
              rows={14}
              disabled={
                loading
              }
              spellCheck={
                false
              }
            />

          </div>

        )}


        {/* ================================================== */}
        {/* CONDITIONAL PREVIEW */}
        {/* ================================================== */}

        {type ===
          "conditional_branch" && (

          <div>

            <label>
              Generated Configuration
            </label>

            <pre
              style={{
                whiteSpace:
                  "pre-wrap",
                wordBreak:
                  "break-word",
              }}
            >
{JSON.stringify(
  {
    field:
      conditionField,

    operator:
      conditionOperator,

    value:
      conditionValue,

    true_step_id:
      trueStepId,

    false_step_id:
      falseStepId,
  },
  null,
  2
)}
            </pre>

          </div>

        )}


        {/* ================================================== */}
        {/* ERROR */}
        {/* ================================================== */}

        {error && (

          <p className="error">
            {error}
          </p>

        )}


        {/* ================================================== */}
        {/* BUTTONS */}
        {/* ================================================== */}

        <div className="workflow-step-form-actions">

          {/* SAVE */}

          <button
            type="submit"
            disabled={
              loading ||
              (
                type ===
                  "conditional_branch" &&
                stepsLoading
              )
            }
          >

            {loading
              ? "Saving..."
              : isEditing
              ? "Save Changes"
              : "Add Step"}

          </button>


          {/* CANCEL */}

          <button
            type="button"
            onClick={
              onCancel
            }
            disabled={
              loading
            }
          >

            Cancel

          </button>

        </div>

      </form>

    </div>
  );
}


export default WorkflowStepForm;