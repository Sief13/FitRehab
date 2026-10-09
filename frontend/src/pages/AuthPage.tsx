import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

type SignupRole = "user" | "physiatrist";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SignupRole>("user");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isRegister) {
        await register({ name: name.trim(), email: email.trim(), password, role });
      } else {
        await login(email.trim(), password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card center-card">
      <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>

      <form className="form" onSubmit={handleSubmit}>
        {isRegister && (
          <label>
            Full name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password {isRegister && <small>(at least 8 characters)</small>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : undefined}
            required
          />
        </label>

        {isRegister && (
          <fieldset className="role-picker">
            <legend>I am a</legend>
            <label>
              <input
                type="radio"
                name="role"
                checked={role === "user"}
                onChange={() => setRole("user")}
              />
              Member (training or recovering)
            </label>
            <label>
              <input
                type="radio"
                name="role"
                checked={role === "physiatrist"}
                onChange={() => setRole("physiatrist")}
              />
              Physiatrist (rehabilitation doctor)
            </label>
          </fieldset>
        )}

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Please wait..." : isRegister ? "Sign up" : "Log in"}
        </button>
      </form>

      <p className="muted no-margin">
        {isRegister ? "Already have an account? " : "New here? "}
        <Link to={isRegister ? "/login" : "/register"} className="link">
          {isRegister ? "Log in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
