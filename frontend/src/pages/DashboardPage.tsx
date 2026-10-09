import { useAuth } from "../auth/useAuth";
import { scoreTone } from "../lib/scoring";

// SAMPLE DATA: replaced by real saved sessions in Step 6.
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
    </>
  );
}
