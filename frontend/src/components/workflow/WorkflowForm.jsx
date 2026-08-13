import { useState } from "react";

import {
  createWorkflow,
  getUserOrganization,
} from "../../lib/graphql";

function WorkflowForm({
  onCreated,
  onCancel,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    // ==========================================================
    // VALIDATION
    // ==========================================================

    const trimmedName =
      name.trim();

    const trimmedDescription =
      description.trim();

    if (!trimmedName) {
      setError(
        "Workflow name is required"
      );
      return;
    }

    // ==========================================================
    // CREATE WORKFLOW
    // ==========================================================

    try {
      setLoading(true);

      // --------------------------------------------------------
      // Get current user's organization
      // --------------------------------------------------------

      const membership =
        await getUserOrganization();

      if (!membership?.org_id) {
        throw new Error(
          "Could not determine your organization"
        );
      }

      console.log(
        "Creating workflow for organization:",
        membership.org_id
      );

      // --------------------------------------------------------
      // Create workflow
      // --------------------------------------------------------

      const workflow =
        await createWorkflow({
          orgId:
            membership.org_id,

          name:
            trimmedName,

          description:
            trimmedDescription ||
            null,
        });

      if (!workflow) {
        throw new Error(
          "Workflow could not be created"
        );
      }

      console.log(
        "Workflow created:",
        workflow
      );

      // --------------------------------------------------------
      // Notify parent
      // --------------------------------------------------------

      if (onCreated) {
        onCreated(workflow);
      }

      // --------------------------------------------------------
      // Reset form
      // --------------------------------------------------------

      setName("");
      setDescription("");
    } catch (err) {
      console.error(
        "Failed to create workflow:",
        err
      );

      setError(
        err?.message ||
          "Could not create workflow"
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <section className="workflow-form">
      <div className="workflow-form-header">
        <div>
          <span className="eyebrow">
            WORKFLOW
          </span>

          <h2>
            Create Workflow
          </h2>

          <p>
            Create a workflow and add
            steps to it later.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
      >
        {/* ================================================== */}
        {/* WORKFLOW NAME */}
        {/* ================================================== */}

        <div className="form-group">
          <label htmlFor="workflow-name">
            Workflow name
          </label>

          <input
            id="workflow-name"
            type="text"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
              )
            }
            placeholder="e.g. AI Content Generator"
            disabled={loading}
            required
          />
        </div>

        {/* ================================================== */}
        {/* DESCRIPTION */}
        {/* ================================================== */}

        <div className="form-group">
          <label htmlFor="workflow-description">
            Description
          </label>

          <textarea
            id="workflow-description"
            value={description}
            onChange={(e) =>
              setDescription(
                e.target.value
              )
            }
            placeholder="Describe what this workflow does..."
            rows={5}
            disabled={loading}
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
        {/* ACTIONS */}
        {/* ================================================== */}

        <div className="workflow-form-actions">
          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Creating..."
              : "Create Workflow"}
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

export default WorkflowForm;