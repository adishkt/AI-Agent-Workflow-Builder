import { useState } from "react";
import WorkflowStepForm from "./WorkflowStepForm";

function WorkflowEditor({ workflow, onBack }) {
  const [steps, setSteps] = useState(
    workflow.workflow_steps || []
  );

  const [showStepForm, setShowStepForm] = useState(false);

  const handleStepCreated = (step) => {
    setSteps((currentSteps) => [
      ...currentSteps,
      step,
    ]);

    setShowStepForm(false);
  };

  return (
    <section className="workflow-editor">
      <button onClick={onBack}>
        ← Back to Workflows
      </button>

      <h2>{workflow.name}</h2>

      <p>
        {workflow.description ||
          "No description"}
      </p>

      <hr />

      <h3>Workflow Steps</h3>

      {steps.length === 0 ? (
        <p>No steps added yet.</p>
      ) : (
        steps
          .sort(
            (a, b) =>
              a.step_order - b.step_order
          )
          .map((step) => (
            <div
              key={step.id}
              className="workflow-step-card"
            >
              <h4>
                Step {step.step_order}:{" "}
                {step.name}
              </h4>

              <p>
                Type: {step.type}
              </p>

              <pre>
                {JSON.stringify(
                  step.config,
                  null,
                  2
                )}
              </pre>
            </div>
          ))
      )}

      {showStepForm ? (
        <WorkflowStepForm
          workflowId={workflow.id}
          nextStepOrder={steps.length + 1}
          onCreated={handleStepCreated}
          onCancel={() =>
            setShowStepForm(false)
          }
        />
      ) : (
        <button
          onClick={() =>
            setShowStepForm(true)
          }
        >
          + Add Step
        </button>
      )}
    </section>
  );
}

export default WorkflowEditor;
