import { useEffect, useState } from "react";
import {
  getWorkflows,
  updateWorkflow,
  deleteWorkflow,
} from "../../lib/graphql";

function WorkflowList({ onOpenWorkflow }) {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingWorkflow, setEditingWorkflow] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getWorkflows();

      setWorkflows(data);
    } catch (err) {
      console.error("Failed to load workflows:", err);

      setError(
        err.message || "Could not load workflows"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (workflow) => {
    setEditingWorkflow(workflow);
    setEditName(workflow.name || "");
    setEditDescription(
      workflow.description || ""
    );
  };

  const handleUpdate = async (e) => {
    e.preventDefault();

    if (!editingWorkflow) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      const updatedWorkflow =
        await updateWorkflow({
          id: editingWorkflow.id,
          name: editName,
          description: editDescription,
        });

      setWorkflows((currentWorkflows) =>
        currentWorkflows.map((workflow) =>
          workflow.id === updatedWorkflow.id
            ? {
                ...workflow,
                ...updatedWorkflow,
              }
            : workflow
        )
      );

      setEditingWorkflow(null);
      setEditName("");
      setEditDescription("");
    } catch (err) {
      console.error(
        "Failed to update workflow:",
        err
      );

      setError(
        err.message ||
          "Could not update workflow"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingWorkflow(null);
    setEditName("");
    setEditDescription("");
  };

  const handleDelete = async (workflow) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${workflow.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      await deleteWorkflow(workflow.id);

      setWorkflows((currentWorkflows) =>
        currentWorkflows.filter(
          (item) =>
            item.id !== workflow.id
        )
      );
    } catch (err) {
      console.error(
        "Failed to delete workflow:",
        err
      );

      setError(
        err.message ||
          "Could not delete workflow"
      );
    }
  };

  if (loading) {
    return <p>Loading workflows...</p>;
  }

  return (
    <section>
      <h2>My Workflows</h2>

      {error && (
        <p className="error">
          {error}
        </p>
      )}

      {workflows.length === 0 ? (
        <p>No workflows found.</p>
      ) : (
        workflows.map((workflow) => (
          <div
            key={workflow.id}
            className="workflow-card"
          >
            {editingWorkflow?.id ===
            workflow.id ? (
              <form onSubmit={handleUpdate}>
                <h3>Edit Workflow</h3>

                <input
                  type="text"
                  value={editName}
                  onChange={(e) =>
                    setEditName(
                      e.target.value
                    )
                  }
                  required
                />

                <textarea
                  value={editDescription}
                  onChange={(e) =>
                    setEditDescription(
                      e.target.value
                    )
                  }
                />

                <button
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : "Save Changes"}
                </button>

                <button
                  type="button"
                  onClick={
                    handleCancelEdit
                  }
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <h3>{workflow.name}</h3>

                <p>
                  {workflow.description ||
                    "No description"}
                </p>

                <p>
                  Steps:{" "}
                  {workflow.workflow_steps
                    ?.length || 0}
                </p>

                <div className="workflow-actions">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenWorkflow(
                        workflow
                      )
                    }
                  >
                    Open
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleEdit(
                        workflow
                      )
                    }
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleDelete(
                        workflow
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </section>
  );
}

export default WorkflowList;