import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ROLE_LABELS, type Role } from "../auth/AuthContext";
import { useAuth } from "../auth/useAuth";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");

  const isRegister = mode === "register";

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // TEMPORARY: no server yet. Step 4 sends these values to the backend instead.
    login({
      name: name.trim() || email.split("@")[0] || "Guest",
      email,
      role,
    });
    navigate(from, { replace: true });
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
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>

        <div className="dev-box">
          <strong>Development preview</strong>
          <p>
            Accounts are not real yet and nothing is sent anywhere. Choose a role to preview how
            the app looks for each type of user.
          </p>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <button type="submit">{isRegister ? "Sign up" : "Log in"}</button>
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
