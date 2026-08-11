import { useState } from "react";
import { createWorkflowStep } from "../../lib/graphql";

function WorkflowStepForm({ workflowId, nextStepOrder, onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("AI");
  const [config, setConfig] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      setError("Config must be valid JSON");
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

      console.log("Workflow step created:", step);

      onCreated(step);
    } catch (err) {
      console.error("Failed to create workflow step:", err);

      setError(
        err.message || "Failed to create workflow step"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="workflow-step-form">
      <h3>Add Workflow Step</h3>

      <form onSubmit={handleSubmit}>
        <div>
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

        <div>
          <label>Step type</label>

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={loading}
          >
            <option value="AI">AI</option>
            <option value="HTTP">HTTP</option>
            <option value="CONDITION">Condition</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>

        <div>
          <label>Configuration (JSON)</label>

          <textarea
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            rows="6"
            disabled={loading}
          />
        </div>

        {error && (
          <p className="error">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
        >
          {loading ? "Adding..." : "Add Step"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </button>
      </form>
    </div>
  );
}

export default WorkflowStepForm;
