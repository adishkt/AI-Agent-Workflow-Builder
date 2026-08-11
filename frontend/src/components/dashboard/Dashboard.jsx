import { nhost } from "../../lib/nhost";
import WorkflowList from "../workflow/WorkflowList";

function Dashboard({ user, onLogout }) {
  const handleLogout = async () => {
    try {
      // Get the current Nhost session
      const session = nhost.getUserSession();

      if (session) {
        // Invalidate the refresh token on the server
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

      // Clear React authentication state
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

      <WorkflowList />
    </main>
  );
}

export default Dashboard;