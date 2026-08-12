import { useMemo, useState } from "react";

import {
  deleteWorkflowStep,
  getCurrentUserRole,
} from "../../lib/graphql";

import WorkflowStepForm from "./WorkflowStepForm";

const STEP_LABELS = {
  llm: "LLM",
  http_request: "HTTP Request",
  db_write: "Database Write",
  conditional_branch: "Conditional Branch",
  approval_gate: "Approval Gate",
};

function WorkflowEditor({
  workflow,
  onBack,
}) {
  const [steps, setSteps] = useState(
    [...(workflow.workflow_steps || [])].sort(
      (a, b) =>
        a.step_order - b.step_order
    )
  );

  const [showStepForm, setShowStepForm] =
    useState(false);

  const [editingStep, setEditingStep] =
    useState(null);

  const [error, setError] = useState("");

  const [role] = useState(() =>
    getCurrentUserRole()
  );

  const canEdit =
    role === "owner" ||
    role === "editor";

  const canDelete =
    role === "owner";

  const sortedSteps = useMemo(
    () =>
      [...steps].sort(
        (a, b) =>
          a.step_order - b.step_order
      ),
    [steps]
  );

  const handleStepSaved = (step) => {
    setError("");

    setSteps((currentSteps) => {
      const exists = currentSteps.some(
        (item) => item.id === step.id
      );

      if (exists) {
        return currentSteps.map((item) =>
          item.id === step.id
            ? step
            : item
        );
      }

      return [
        ...currentSteps,
        step,
      ];
    });

    setShowStepForm(false);
    setEditingStep(null);
  };

  const handleEdit = (step) => {
    setError("");
    setEditingStep(step);
    setShowStepForm(false);
  };

  const handleDelete = async (step) => {
    const confirmed =
      window.confirm(
        `Delete "${step.name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      await deleteWorkflowStep(
        step.id
      );

      setSteps((currentSteps) =>
        currentSteps
          .filter(
            (item) =>
              item.id !== step.id
          )
          .map((item, index) => ({
            ...item,
            step_order: index + 1,
          }))
      );
    } catch (err) {
      console.error(
        "Failed to delete workflow step:",
        err
      );

      setError(
        err.message ||
          "Could not delete workflow step"
      );
    }
  };

  const handleMoveUp = (step) => {
    const index =
      sortedSteps.findIndex(
        (item) =>
          item.id === step.id
      );

    if (index <= 0) {
      return;
    }

    const previous =
      sortedSteps[index - 1];

    setSteps(
      sortedSteps.map((item) => {
        if (item.id === step.id) {
          return {
            ...item,
            step_order:
              previous.step_order,
          };
        }

        if (item.id === previous.id) {
          return {
            ...item,
            step_order:
              step.step_order,
          };
        }

        return item;
      })
    );
  };

  const handleMoveDown = (step) => {
    const index =
      sortedSteps.findIndex(
        (item) =>
          item.id === step.id
      );

    if (
      index === -1 ||
      index >=
        sortedSteps.length - 1
    ) {
      return;
    }

    const next =
      sortedSteps[index + 1];

    setSteps(
      sortedSteps.map((item) => {
        if (item.id === step.id) {
          return {
            ...item,
            step_order:
              next.step_order,
          };
        }

        if (item.id === next.id) {
          return {
            ...item,
            step_order:
              step.step_order,
          };
        }

        return item;
      })
    );
  };

  return (
    <section className="workflow-editor">
      <button onClick={onBack}>
        ← Back to Workflows
      </button>

      <div className="workflow-editor-header">
        <div>
          <h2>{workflow.name}</h2>

          <p>
            {workflow.description ||
              "No description"}
          </p>
        </div>

        <div>
          <strong>
            Role: {role}
          </strong>
        </div>
      </div>

      <hr />

      {error && (
        <p className="error">
          {error}
        </p>
      )}

      <div className="workflow-editor-title">
        <h3>Workflow Steps</h3>

        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setEditingStep(null);
              setShowStepForm(true);
            }}
          >
            + Add Step
          </button>
        )}
      </div>

      {sortedSteps.length === 0 ? (
        <p>
          No steps added yet.
        </p>
      ) : (
        <div className="workflow-steps">
          {sortedSteps.map(
            (step, index) => (
              <div
                key={step.id}
                className="workflow-step-card"
              >
                <div className="workflow-step-header">
                  <div>
                    <h4>
                      Step{" "}
                      {step.step_order}:{" "}
                      {step.name}
                    </h4>

                    <span>
                      {STEP_LABELS[
                        step.type
                      ] ||
                        step.type}
                    </span>
                  </div>

                  <div className="workflow-step-actions">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleMoveUp(
                              step
                            )
                          }
                          disabled={
                            index === 0
                          }
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleMoveDown(
                              step
                            )
                          }
                          disabled={
                            index ===
                            sortedSteps.length -
                              1
                          }
                        >
                          ↓
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleEdit(
                              step
                            )
                          }
                        >
                          Edit
                        </button>
                      </>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() =>
                          handleDelete(
                            step
                          )
                        }
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                <pre>
                  {JSON.stringify(
                    step.config,
                    null,
                    2
                  )}
                </pre>
              </div>
            )
          )}
        </div>
      )}

      {showStepForm && canEdit && (
        <WorkflowStepForm
          workflowId={workflow.id}
          nextStepOrder={
            sortedSteps.length + 1
          }
          steps={sortedSteps}
          onSaved={
            handleStepSaved
          }
          onCancel={() =>
            setShowStepForm(false)
          }
        />
      )}

      {editingStep && canEdit && (
        <WorkflowStepForm
          workflowId={workflow.id}
          existingStep={editingStep}
          steps={sortedSteps}
          onSaved={
            handleStepSaved
          }
          onCancel={() =>
            setEditingStep(null)
          }
        />
      )}
    </section>
  );
}

export default WorkflowEditor;