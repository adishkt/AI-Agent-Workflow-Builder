import { useCallback, useEffect, useMemo, useState } from "react";
import WorkflowStepForm from "./WorkflowStepForm";
import {
  approveStep,
  getWorkflowRun,
  triggerWorkflowRun,
} from "../../lib/graphql";

const TYPE_LABELS = {
  llm: "LLM",
  approval_gate: "Approval Gate",
  conditional_branch: "Conditional Branch",
  http_request: "HTTP Request",
  db_write: "Database Write",
};

const STATUS_LABELS = {
  pending: "Pending",
  running: "Running",
  paused: "Waiting for approval",
  completed: "Completed",
  failed: "Failed",
};

function statusClass(status) {
  return `status-pill status-${status || "unknown"}`;
}

function formatOutput(output) {
  if (output === null || output === undefined || output === "") {
    return "No output yet";
  }

  if (typeof output === "string") {
    return output;
  }

  return JSON.stringify(output, null, 2);
}

function WorkflowEditor({ workflow, onBack }) {
  const [steps, setSteps] = useState(
    [...(workflow.workflow_steps || [])].sort(
      (a, b) => a.step_order - b.step_order
    )
  );

  const [showStepForm, setShowStepForm] = useState(false);
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [stepRuns, setStepRuns] = useState([]);
  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(null);
  const [runError, setRunError] = useState("");

  const loadRun = useCallback(async (id) => {
    if (!id) return;

    try {
      const result = await getWorkflowRun(id);
      setRun(result.run);
      setStepRuns(result.stepRuns || []);
      return result;
    } catch (error) {
      console.error("Failed to load workflow run:", error);
      setRunError(error.message || "Could not load workflow run");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!runId) return undefined;

    let cancelled = false;

    const poll = async () => {
      const result = await loadRun(runId);
      if (cancelled || !result?.run) return;

      const status = result.run.status;
      if (status !== "running" && status !== "paused") {
        return;
      }
    };

    poll();
    const interval = window.setInterval(async () => {
      if (cancelled) return;

      const result = await loadRun(runId);
      if (!result?.run) return;

      if (
        result.run.status !== "running" &&
        result.run.status !== "paused"
      ) {
        window.clearInterval(interval);
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runId, loadRun]);

  const handleStepCreated = (step) => {
    setSteps((currentSteps) =>
      [...currentSteps, step].sort(
        (a, b) => a.step_order - b.step_order
      )
    );
    setShowStepForm(false);
  };

  const handleRun = async () => {
    try {
      setRunning(true);
      setRunError("");
      setRun(null);
      setStepRuns([]);

      const result = await triggerWorkflowRun(workflow.id);
      setRunId(result.run_id);
      await loadRun(result.run_id);
    } catch (error) {
      console.error("Failed to start workflow:", error);
      setRunError(error.message || "Could not start workflow");
    } finally {
      setRunning(false);
    }
  };

  const handleApprove = async (stepRunId) => {
    try {
      setApproving(stepRunId);
      setRunError("");

      await approveStep(stepRunId);
      await loadRun(runId);
    } catch (error) {
      console.error("Failed to approve step:", error);
      setRunError(error.message || "Could not approve step");
    } finally {
      setApproving(null);
    }
  };

  const stepRunByStepId = useMemo(() => {
    const map = new Map();

    for (const stepRun of stepRuns) {
      map.set(stepRun.workflow_step_id, stepRun);
    }

    return map;
  }, [stepRuns]);

  const activeApproval = stepRuns.find(
    (item) => item.status === "paused"
  );

  return (
    <section className="workflow-editor">
      <div className="editor-toolbar">
        <button onClick={onBack} className="secondary-button">
          ← Back to Workflows
        </button>

        <button
          onClick={handleRun}
          disabled={running || steps.length === 0}
        >
          {running ? "Starting..." : "▶ Run Workflow"}
        </button>
      </div>

      <div className="workflow-header panel">
        <div>
          <span className="eyebrow">WORKFLOW</span>
          <h2>{workflow.name}</h2>
          <p>{workflow.description || "No description"}</p>
        </div>

        {run && (
          <div className="run-summary">
            <span className={statusClass(run.status)}>
              {STATUS_LABELS[run.status] || run.status}
            </span>
            <small>Run: {run.id}</small>
          </div>
        )}
      </div>

      {runError && <p className="error run-error">{runError}</p>}

      {activeApproval && (
        <div className="approval-panel">
          <div>
            <span className="eyebrow">ACTION REQUIRED</span>
            <h3>Workflow is waiting for approval</h3>
            <p>
              {activeApproval.output?.message ||
                "Please approve this workflow before continuing."}
            </p>
          </div>

          <button
            onClick={() => handleApprove(activeApproval.id)}
            disabled={approving === activeApproval.id}
          >
            {approving === activeApproval.id ? "Approving..." : "Approve"}
          </button>
        </div>
      )}

      <div className="section-heading">
        <div>
          <span className="eyebrow">PIPELINE</span>
          <h3>Workflow Steps</h3>
        </div>
        <span className="step-count">{steps.length} steps</span>
      </div>

      {steps.length === 0 ? (
        <div className="empty-state">
          <p>No steps added yet.</p>
          <p>Add an LLM, approval gate, condition, or another supported step.</p>
        </div>
      ) : (
        <div className="workflow-step-list">
          {steps.map((step) => {
            const stepRun = stepRunByStepId.get(step.id);
            const conditionOutput =
              stepRun?.output &&
              step.type === "conditional_branch"
                ? stepRun.output
                : null;

            const selected =
              conditionOutput?.selected_step_id ||
              (conditionOutput?.result
                ? conditionOutput?.true_step_id
                : conditionOutput?.false_step_id);

            return (
              <div key={step.id} className="workflow-step-card panel">
                <div className="step-card-top">
                  <div className="step-number">{step.step_order}</div>

                  <div className="step-main">
                    <div className="step-title-row">
                      <h4>{step.name}</h4>
                      <span className="type-pill">
                        {TYPE_LABELS[step.type] || step.type}
                      </span>
                    </div>
                    <small className="step-id">{step.id}</small>
                  </div>

                  {stepRun && (
                    <span className={statusClass(stepRun.status)}>
                      {STATUS_LABELS[stepRun.status] || stepRun.status}
                    </span>
                  )}
                </div>

                {step.type === "approval_gate" && stepRun?.status === "paused" && (
                  <div className="inline-approval">
                    <strong>Approval required</strong>
                    <span>
                      {stepRun.output?.message ||
                        step.config?.message ||
                        "Please approve this step."}
                    </span>
                    <button
                      onClick={() => handleApprove(stepRun.id)}
                      disabled={approving === stepRun.id}
                    >
                      {approving === stepRun.id ? "Approving..." : "Approve"}
                    </button>
                  </div>
                )}

                {step.type === "conditional_branch" && stepRun?.output && (
                  <div className="condition-result">
                    <div className="condition-grid">
                      <div>
                        <span>Actual</span>
                        <strong>{String(stepRun.output.actual ?? "undefined")}</strong>
                      </div>
                      <div>
                        <span>Operator</span>
                        <strong>{stepRun.output.operator}</strong>
                      </div>
                      <div>
                        <span>Expected</span>
                        <strong>{String(stepRun.output.expected ?? "")}</strong>
                      </div>
                      <div>
                        <span>Result</span>
                        <strong>
                          {stepRun.output.result ? "TRUE" : "FALSE"}
                        </strong>
                      </div>
                    </div>

                    <div className="selected-branch">
                      Selected branch: <strong>{selected || "None"}</strong>
                    </div>
                  </div>
                )}

                {stepRun?.error && (
                  <div className="step-error">
                    <strong>Error</strong>
                    <pre>{stepRun.error}</pre>
                  </div>
                )}

                {stepRun?.output && step.type !== "conditional_branch" && (
                  <details className="step-output">
                    <summary>View output</summary>
                    <pre>{formatOutput(stepRun.output)}</pre>
                  </details>
                )}

                {!stepRun && (
                  <details className="step-config">
                    <summary>Configuration</summary>
                    <pre>{JSON.stringify(step.config, null, 2)}</pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      {run && (
        <div className="run-details panel">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">EXECUTION</span>
              <h3>Latest Run</h3>
            </div>
            <button
              className="secondary-button"
              onClick={() => loadRun(runId)}
            >
              Refresh
            </button>
          </div>

          <div className="run-meta">
            <span>
              Status: <strong>{STATUS_LABELS[run.status] || run.status}</strong>
            </span>
            <span>
              Step runs: <strong>{stepRuns.length}</strong>
            </span>
          </div>

          {run.error && (
            <div className="step-error">
              <strong>Workflow error</strong>
              <pre>{run.error}</pre>
            </div>
          )}
        </div>
      )}

      {showStepForm ? (
        <WorkflowStepForm
          workflowId={workflow.id}
          nextStepOrder={
            steps.length
              ? Math.max(...steps.map((step) => step.step_order)) + 1
              : 1
          }
          onCreated={handleStepCreated}
          onCancel={() => setShowStepForm(false)}
        />
      ) : (
        <button
          className="add-step-button"
          onClick={() => setShowStepForm(true)}
        >
          + Add Step
        </button>
      )}
    </section>
  );
}

export default WorkflowEditor;
