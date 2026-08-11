import { useState } from "react";
import { nhost } from "../../lib/nhost";

import WorkflowList from "../workflow/WorkflowList";
import WorkflowForm from "../workflow/WorkflowForm";
import WorkflowEditor from "../workflow/WorkflowEditor";

function Dashboard({ user, onLogout }) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [selectedWorkflow, setSelectedWorkflow] =useState(null);

  const handleLogout = async () => {
    try {
      const session = nhost.getUserSession();

      if (session) {
        const result = await nhost.auth.signOut({
          refreshToken: session.refreshToken,
        });

        if (result.error) {
          console.error(
            "Logout failed:",
            result.error
          );
          return;
        }
      }

      onLogout();
    } catch (error) {
      console.error(
        "Logout error:",
        error
      );
    }
  };

  return (
    <main className="dashboard">
      <h1>AI Workflow Builder</h1>

      <p>
        Welcome, {user?.email || "User"}
      </p>

      <button onClick={handleLogout}>
        Logout
      </button>

      <hr />

      {showCreateForm ? (
        <WorkflowForm
          onCreated={() => {
            setShowCreateForm(false);
          }}
          onCancel={() => {
            setShowCreateForm(false);
          }}
        />
      ) : (
        <>
          <button
            onClick={() => setShowCreateForm(true)}
          >
            + Create Workflow
          </button>

          {selectedWorkflow ? (
            <WorkflowEditor
              workflow={selectedWorkflow}
              onBack={() =>
                setSelectedWorkflow(null)
              }
            />
          ) : (
            <WorkflowList
              onOpenWorkflow={(workflow) =>
                setSelectedWorkflow(workflow)
              }
            />
          )}
        </>
      )}
    </main>
  );
}

export default Dashboard;