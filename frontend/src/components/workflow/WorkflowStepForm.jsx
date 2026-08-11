import { useEffect, useState } from "react";
import { createWorkflowStep } from "../../lib/graphql";

const STEP_TYPES = [
  { value: "llm", label: "LLM" },
  { value: "approval_gate", label: "Approval Gate" },
  { value: "conditional_branch", label: "Conditional Branch" },
  { value: "http_request", label: "HTTP Request" },
  { value: "db_write", label: "Database Write" },
];

function getDefaultConfig(type) {
  switch (type) {
    case "llm":
      return JSON.stringify(
        {
          model: "openai/gpt-4o-mini",
          prompt: "Give me three startup ideas related to AI.",
          max_tokens: 120,
        },
        null,
        2
      );

    case "approval_gate":
      return JSON.stringify(
        {
          message: "Please approve this workflow before continuing.",
        },
        null,
        2
      );

    case "conditional_branch":
      return JSON.stringify(
        {
          field: "text",
          value: "Personalized",
          operator: "contains",
          true_step_id: "",
          false_step_id: "",
        },
        null,
        2
      );

    case "http_request":
      return JSON.stringify(
        {
          method: "GET",
          url: "",
          headers: {},
          body: {},
        },
        null,
        2
      );

    case "db_write":
      return JSON.stringify(
        {
          table: "",
          data: {},
        },
        null,
        2
      );

    default:
      return "{}";
  }
}

function WorkflowStepForm({
  workflowId,
  nextStepOrder,
  onCreated,
  onCancel,
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("llm");
  const [config, setConfig] = useState(getDefaultConfig("llm"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setConfig(getDefaultConfig(type));
  }, [type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Step name is required");
      return;
    }

    let parsedConfig;

    try {
      parsedConfig = JSON.parse(config);
    } catch {
      setError("Configuration must be valid JSON");
      return;
    }

    try {
      setLoading(true);

      const step = await createWorkflowStep({
        workflowId,
        stepOrder: nextStepOrder,
        name: name.trim(),
        type,
        config: parsedConfig,
      });

      onCreated(step);
    } catch (err) {
      console.error("Failed to create workflow step:", err);
      setError(err.message || "Failed to create workflow step");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="workflow-step-form panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">WORKFLOW BUILDER</span>
          <h3>Add Workflow Step</h3>
        </div>
        <span className="step-order-badge">Step {nextStepOrder}</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label>Step name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Generate AI Response"
            disabled={loading}
            required
          />
        </div>

        <div className="form-field">
          <label>Step type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={loading}
          >
            {STEP_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>Configuration (JSON)</label>
          <textarea
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            rows={10}
            spellCheck="false"
            disabled={loading}
          />
          <small>
            Use the step IDs from the workflow for conditional true/false branches.
          </small>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add Step"}
          </button>
          <button type="button" onClick={onCancel} disabled={loading} className="secondary-button">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default WorkflowStepForm;
