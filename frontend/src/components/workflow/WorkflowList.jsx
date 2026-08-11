import { useEffect, useState } from "react";
import { getWorkflows } from "../../lib/graphql";

function WorkflowList() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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

    loadWorkflows();
  }, []);

  if (loading) {
    return <p>Loading workflows...</p>;
  }

  if (error) {
    return <p>Failed to load workflows: {error}</p>;
  }

  if (workflows.length === 0) {
    return <p>No workflows found.</p>;
  }

  return (
    <section>
      <h2>My Workflows</h2>

      {workflows.map((workflow) => (
        <div
          key={workflow.id}
          className="workflow-card"
        >
          <h3>{workflow.name}</h3>

          <p>
            {workflow.description ||
              "No description"}
          </p>

          <p>
            Steps:{" "}
            {workflow.workflow_steps?.length || 0}
          </p>
        </div>
      ))}
    </section>
  );
}

export default WorkflowList;
