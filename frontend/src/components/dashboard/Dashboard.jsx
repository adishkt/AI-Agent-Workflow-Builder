import { useState } from "react";
import { nhost } from "../../lib/nhost";

import WorkflowList from "../workflow/WorkflowList";
import WorkflowForm from "../workflow/WorkflowForm";
import WorkflowEditor from "../workflow/WorkflowEditor";

function Dashboard({ user, onLogout }) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0);

  const handleLogout = async () => {
    try {
      const session = nhost.getUserSession();

      if (session) {
        const result = await nhost.auth.signOut({
          refreshToken: session.refreshToken,
        });

        if (result.error) {
          console.error("Logout failed:", result.error);
          return;
        }
      }

      onLogout();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleWorkflowCreated = () => {
    setShowCreateForm(false);
    setWorkflowRefreshKey((value) => value + 1);
  };

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">AI AUTOMATION</span>
          <h1>AI Workflow Builder</h1>
          <p>Build, run and monitor AI agent workflows.</p>
        </div>

        <div className="user-area">
          <span>{user?.email || "User"}</span>
          <button className="secondary-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {showCreateForm ? (
        <WorkflowForm
          onCreated={handleWorkflowCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      ) : selectedWorkflow ? (
        <WorkflowEditor
          workflow={selectedWorkflow}
          onBack={() => setSelectedWorkflow(null)}
        />
      ) : (
        <>
          <div className="dashboard-actions">
            <div>
              <span className="eyebrow">PROJECT</span>
              <h2>Your workflows</h2>
            </div>
            <button onClick={() => setShowCreateForm(true)}>
              + Create Workflow
            </button>
          </div>

          <WorkflowList
            key={workflowRefreshKey}
            onOpenWorkflow={(workflow) => setSelectedWorkflow(workflow)}
          />
        </>
      )}
    </main>
  );
}

export default Dashboard;
