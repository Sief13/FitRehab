import { useState } from "react";
import { authApi } from "../api/auth";
import { ROLE_LABELS, type Role } from "../auth/AuthContext";
import { useAuth } from "../auth/useAuth";
import { scoreTone } from "../lib/scoring";

// SAMPLE DATA: replaced by real saved sessions in a later step.
const STATS = [
  { label: "Sessions this week", value: "4" },
  { label: "Average form score", value: "82" },
  { label: "Total reps", value: "148" },
  { label: "Day streak", value: "3" },
];

const RECENT = [
  { date: "Mon", exercise: "Squat", reps: 20, score: 88 },
  { date: "Tue", exercise: "Bicep curl", reps: 24, score: 79 },
  { date: "Thu", exercise: "Squat", reps: 18, score: 91 },
  { date: "Fri", exercise: "Bicep curl", reps: 22, score: 72 },
];

/** Only rendered by `npm run dev`; removed from production builds. */
function DevRoleSwitcher() {
  const { user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(role: Role) {
    setBusy(true);
    setError("");
    try {
      updateUser(await authApi.devSetRole(role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dev-box spaced">
      <strong>Development tools</strong>
      <p>
        Switch your role to preview the Premium and Physiatrist screens. Real payments and doctor
        verification will replace this later.
      </p>
      <div className="toolbar">
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <button
            key={r}
            className="secondary"
            disabled={busy || user?.role === r}
            onClick={() => change(r)}
          >
            {ROLE_LABELS[r]}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <>
      <h1>Hi {user?.name}</h1>
      <p className="muted">Here is your progress. The numbers below are sample data for now.</p>

      <section className="grid-4">
        {STATS.map((s) => (
          <div className="card stat" key={s.label}>
            <span className="stat-value">{s.value}</span>
            <span className="hud-label">{s.label}</span>
          </div>
        ))}
      </section>

      <div className="card spaced">
        <h2>Recent sessions</h2>
        <table className="reps">
          <thead>
            <tr>
              <th>Day</th>
              <th>Exercise</th>
              <th>Reps</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {RECENT.map((r) => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{r.exercise}</td>
                <td>{r.reps}</td>
                <td className={`score tone-${scoreTone(r.score)}`}>{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {import.meta.env.DEV && <DevRoleSwitcher />}
    </>
  );
}
