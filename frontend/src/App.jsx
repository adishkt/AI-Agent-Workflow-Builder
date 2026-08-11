import { useEffect, useState } from "react";

import Login from "./components/auth/Login";
import Signup from "./components/auth/Signup";
import Dashboard from "./components/dashboard/Dashboard";

import { nhost } from "./lib/nhost";

import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignup, setShowSignup] = useState(false);

  // Check if the user already has an Nhost session
  useEffect(() => {
    const loadUser = async () => {
      try {
        const result = await nhost.auth.getUser();

        if (result.error) {
          setUser(null);
        } else {
          setUser(result.body || null);
        }
      } catch (error) {
        console.error("Could not load user:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  // Initial loading
  if (loading) {
    return <p>Loading...</p>;
  }

  // Logged in
  if (user) {
    return (
      <Dashboard
        user={user}
        onLogout={() => setUser(null)}
      />
    );
  }

  // Signup
  if (showSignup) {
    return (
      <main className="auth-container">
        <Signup
          onSwitchToLogin={() => setShowSignup(false)}
        />
      </main>
    );
  }

  // Login
  return (
    <main className="auth-container">
      <Login
        onSwitchToSignup={() => setShowSignup(true)}
        onLogin={(loggedInUser) => {
          setUser(loggedInUser);
        }}
      />
    </main>
  );
}

export default App;