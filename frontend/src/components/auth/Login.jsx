import { useState } from "react";
import { nhost } from "../../lib/nhost";

function Login({ onSwitchToSignup, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      const result =
        await nhost.auth.signInEmailPassword({
          email,
          password,
        });

      if (result.error) {
        throw new Error(
          result.error.message || "Login failed"
        );
      }

      // Get the authenticated user
      const userResult =
        await nhost.auth.getUser();
        

      if (userResult.error) {
        throw new Error(
          userResult.error.message ||
            "Could not get logged-in user"
        );
      }

      const user = userResult.body;

      if (!user) {
        throw new Error(
          "Login succeeded but user information was not found"
        );
      }

      // Tell App.jsx that login succeeded
      onLogin(user);

    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      setMessage(
        error?.message || "Login failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h1>AI Workflow Builder</h1>

      <p>Sign in to continue</p>

      <form onSubmit={handleSubmit}>
        <label>Email</label>

        <input
          type="email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          placeholder="Enter your email"
          required
        />

        <label>Password</label>

        <input
          type="password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          placeholder="Enter your password"
          required
          minLength={6}
        />

        <button
          type="submit"
          disabled={loading}
        >
          {loading ? "Please wait..." : "Login"}
        </button>
      </form>

      {message && (
        <p className="message">
          {message}
        </p>
      )}

      <button
        className="switch-button"
        onClick={onSwitchToSignup}
      >
        Don't have an account? Sign Up
      </button>
    </div>
  );
}

export default Login;