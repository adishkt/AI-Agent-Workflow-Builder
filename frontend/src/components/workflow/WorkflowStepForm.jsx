import { useState } from "react";

import {
  createWorkflowStep,
  updateWorkflowStep,
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
  // CONFIGURATION
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
  // STATE
  // ==========================================================

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");


  // ==========================================================
  // SUBMIT
  // ==========================================================

  const handleSubmit = async (e) => {

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
    // Parse JSON
    // --------------------------------------------------------

    let parsedConfig;

    try {

      parsedConfig =
        JSON.parse(config);

    } catch (err) {

      setError(
        "Configuration must be valid JSON"
      );

      return;
    }


    // --------------------------------------------------------
    // LLM validation
    // --------------------------------------------------------

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
     * Only replace the configuration
     * when creating a new step.
     *
     * When editing, preserve the
     * existing configuration.
     */

    if (isEditing) {
      return;
    }


    if (newType === "llm") {

      setConfig(`{
  "model": "openai/gpt-4o-mini",
  "prompt": "",
  "max_tokens": 120
}`);

    } else if (
      newType === "http_request"
    ) {

      setConfig(`{
  "url": "",
  "method": "GET",
  "headers": {},
  "body": {}
}`);

    } else if (
      newType === "db_write"
    ) {

      setConfig(`{
  "table": "",
  "data": {}
}`);

    } else if (
      newType ===
      "conditional_branch"
    ) {

      setConfig(`{
  "condition": "",
  "true_step": "",
  "false_step": ""
}`);

    } else if (
      newType ===
      "approval_gate"
    ) {

      setConfig(`{
  "message": "Approval required"
}`);

    }

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
        {/* CONFIGURATION */}
        {/* ================================================== */}

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
            disabled={loading}
            spellCheck={false}
          />

        </div>


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
            disabled={loading}
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
            disabled={loading}
          >
            Cancel
          </button>

        </div>

      </form>

    </div>
  );
}


export default WorkflowStepForm;