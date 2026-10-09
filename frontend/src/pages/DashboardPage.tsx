import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../api/auth";
import { sessionsApi, type SessionSummary, type Stats } from "../api/sessions";
import { ROLE_LABELS, type Role } from "../auth/AuthContext";
import { useAuth } from "../auth/useAuth";
import { EXERCISES, type ExerciseKey } from "../lib/exercises";
import { scoreTone } from "../lib/scoring";

interface DashboardData {
  stats: Stats;
  sessions: SessionSummary[];
}

function exerciseLabel(key: string): string {
  return EXERCISES[key as ExerciseKey]?.label ?? key;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Load stats + latest sessions on mount, and again whenever reloadKey changes
  useEffect(() => {
    let cancelled = false;
    const tzOffset = -new Date().getTimezoneOffset(); // minutes east of UTC
    Promise.all([sessionsApi.stats(tzOffset), sessionsApi.list(10)])
      .then(([stats, sessions]) => {
        if (cancelled) return;
        setData({ stats, sessions });
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your data");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await sessionsApi.remove(id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the session");
    } finally {
      setDeletingId(null);
    }
  }

  const stats = data?.stats;
  const cards = [
    { label: "Sessions (last 7 days)", value: stats ? String(stats.sessions_last_7_days) : "-" },
    {
      label: "Average form score",
      value: stats?.average_score != null ? String(Math.round(stats.average_score)) : "-",
    },
    { label: "Total reps", value: stats ? String(stats.total_reps) : "-" },
    { label: "Day streak", value: stats ? String(stats.streak_days) : "-" },
  ];

  return (
    <>
      <h1>Hi {user?.name}</h1>
      <p className="muted">Your progress, based on the workouts you have saved.</p>

      {error && (
        <p className="form-error spaced">
          {error}{" "}
          <button className="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </p>
      )}

      <section className="grid-4">
        {cards.map((c) => (
          <div className="card stat" key={c.label}>
            <span className="stat-value">{c.value}</span>
            <span className="hud-label">{c.label}</span>
          </div>
        ))}
      </section>

      <div className="card spaced">
        <h2>Recent sessions</h2>

        {data === null && !error && <p className="empty">Loading your progress...</p>}

        {data && data.sessions.length === 0 && (
          <p className="empty">
            No sessions yet. <Link to="/workout">Start your first workout</Link> and it will show
            up here.
          </p>
        )}

        {data && data.sessions.length > 0 && (
          <table className="reps">
            <thead>
              <tr>
                <th>When</th>
                <th>Exercise</th>
                <th>Reps</th>
                <th>Score</th>
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.started_at)}</td>
                  <td>{exerciseLabel(s.exercise)}</td>
                  <td>{s.rep_count}</td>
                  <td className={`score tone-${scoreTone(Math.round(s.avg_score))}`}>
                    {Math.round(s.avg_score)}
                  </td>
                  <td>{formatDuration(s.duration_sec)}</td>
                  <td className="actions">
                    <button
                      className="link-btn"
                      disabled={deletingId === s.id}
                      onClick={() => handleDelete(s.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.sessions.length === 10 && (
          <p className="muted small spaced">Showing your latest 10 sessions.</p>
        )}
      </div>

      {import.meta.env.DEV && <DevRoleSwitcher />}
    </>
  );
}
