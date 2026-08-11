import { useState } from "react";
import { nhost } from "../../lib/nhost";

function Signup({ onSwitchToLogin }) {
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
        await nhost.auth.signUpEmailPassword({
          email,
          password,
        });

      if (result.error) {
        throw new Error(
          result.error.message ||
            "Signup failed"
        );
      }

      setMessage(
        "Account created. Check your email if verification is required."
      );
    } catch (error) {
      console.error(
        "Signup error:",
        error
      );

      setMessage(
        error?.message ||
          "Signup failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h1>AI Workflow Builder</h1>

      <p>Create your account</p>

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
          {loading
            ? "Please wait..."
            : "Create Account"}
        </button>
      </form>

      {message && (
        <p className="message">
          {message}
        </p>
      )}

      <button
        className="switch-button"
        onClick={onSwitchToLogin}
      >
        Already have an account? Login
      </button>
    </div>
  );
}

export default Signup;
