import { useState } from "react";
import {
  createWorkflow,
  getUserOrganization,
} from "../../lib/graphql";

function WorkflowForm({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (!name.trim()) {
      setError("Workflow name is required");
      return;
    }

    try {
      setLoading(true);

      console.log("Creating workflow:", {
        name,
        description,
      });

      // Get the logged-in user's organization
      const membership = await getUserOrganization();

      console.log("User organization:", membership);

      const orgId = membership.org_id;

      // Create workflow
      const workflow = await createWorkflow({
        orgId,
        name: name.trim(),
        description: description.trim(),
      });

      console.log("Workflow created:", workflow);

      // Tell Dashboard that creation succeeded
      onCreated(workflow);
    } catch (err) {
      console.error("Create workflow failed:", err);
      setError(err.message || "Failed to create workflow");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="workflow-form">
      <h2>Create Workflow</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Workflow name</label>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Startup Idea Generator"
            disabled={loading}
          />
        </div>

        <div>
          <label>Description</label>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this workflow do?"
            disabled={loading}
          />
        </div>

        {error && (
          <p style={{ color: "red" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Workflow"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </button>
      </form>
    </section>
  );
}

export default WorkflowForm;