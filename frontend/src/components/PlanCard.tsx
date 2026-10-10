import { Link } from "react-router-dom";
import type { Plan, PlanItem } from "../api/rehab";
import { EXERCISES } from "../lib/exercises";
import { formatDate, toneAgainstTarget } from "../lib/format";

function Progress({ item }: { item: PlanItem }) {
  const p = item.progress;
  if (p.sessions === 0) return <span className="muted">Not started</span>;

  const average = p.average_score === null ? null : Math.round(p.average_score);
  return (
    <span>
      {p.sessions} workout{p.sessions === 1 ? "" : "s"} · {p.total_reps} reps
      {average !== null && (
        <>
          {" "}
          · avg <span className={`score tone-${toneAgainstTarget(average, item.target_score)}`}>{average}</span>
        </>
      )}
      {p.last_done_at && <span className="muted small"> · last {formatDate(p.last_done_at)}</span>}
    </span>
  );
}

/** A rehab plan with per-exercise progress. Patients get Start buttons; physiatrists do not. */
export default function PlanCard({ plan, mode }: { plan: Plan; mode: "patient" | "doctor" }) {
  return (
    <div className="card plan-card">
      <h2>{plan.title}</h2>
      {mode === "patient" && <p className="muted small">From {plan.physiatrist.name}</p>}
      {plan.notes && <p className="plan-notes">{plan.notes}</p>}

      <table className="reps">
        <thead>
          <tr>
            <th>Exercise</th>
            <th>Prescription</th>
            <th>Target</th>
            <th>Progress</th>
            {mode === "patient" && <th />}
          </tr>
        </thead>
        <tbody>
          {plan.items.map((item) => (
            <tr key={item.id}>
              <td>{EXERCISES[item.exercise]?.label ?? item.exercise}</td>
              <td>
                {item.sets} × {item.reps_per_set}
              </td>
              <td>{item.target_score}+</td>
              <td>
                <Progress item={item} />
              </td>
              {mode === "patient" && (
                <td className="actions">
                  <Link to={`/workout?item=${item.id}`} className="btn">
                    Start
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
