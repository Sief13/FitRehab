import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { plansApi, type MonthlyPlan } from "../api/plans";
import { useAuth } from "../auth/useAuth";
import { EXERCISES, type ExerciseKey } from "../lib/exercises";
import { formatShortDate } from "../lib/format";

const label = (key: string) => EXERCISES[key as ExerciseKey]?.label ?? key;

/** Shown to Free members: what Premium adds and a way to upgrade. */
function LockedPlan() {
  return (
    <>
      <h1>My plan</h1>
      <div className="card center-card">
        <h2>Premium feature</h2>
        <p className="muted">
          Premium builds a 4-week plan from your own workouts. It raises the volume as you improve,
          adds a recovery week, and focuses on the part of your form that needs the most work.
        </p>
        <Link to="/premium" className="btn">
          See Premium
        </Link>
      </div>
    </>
  );
}

function AdaptivePlan() {
  const location = useLocation();
  const justUpgraded = (location.state as { justUpgraded?: boolean } | null)?.justUpgraded === true;

  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [error, setError] = useState("");
  const [week, setWeek] = useState(1);

  useEffect(() => {
    let cancelled = false;
    plansApi
      .monthly()
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your plan");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = plan?.weeks.find((w) => w.week === week);

  return (
    <>
      <h1>My plan</h1>
      {justUpgraded && <p className="form-ok">Welcome to Premium! Your plan is ready below.</p>}

      {error && (
        <p className="form-error">
          {error}{" "}
          <Link to="/premium" className="link">
            Check your Premium status
          </Link>
        </p>
      )}
      {plan === null && !error && <p className="muted">Building your plan...</p>}

      {plan && (
        <>
          <p className="muted">
            Built from your {plan.based_on_sessions} workout{plan.based_on_sessions === 1 ? "" : "s"} in
            the last {plan.window_days} days (updated {formatShortDate(plan.generated_at)}). Train more
            and your plan adapts the next time you open this page.
          </p>

          <div className="insights">
            {plan.insights.map((i) => (
              <div className="card insight" key={i.exercise}>
                <strong>{label(i.exercise)}</strong>
                <p className="muted small no-margin">{i.message}</p>
              </div>
            ))}
          </div>

          <div className="week-tabs">
            {plan.weeks.map((w) => (
              <button
                key={w.week}
                className={w.week === week ? "tab active" : "tab"}
                onClick={() => setWeek(w.week)}
              >
                Week {w.week} · {w.title}
              </button>
            ))}
          </div>

          {current && (
            <div className="card">
              <table className="reps schedule">
                <tbody>
                  {current.days.map((d) => (
                    <tr key={d.day} className={d.items.length === 0 ? "rest" : ""}>
                      <th>{d.day}</th>
                      <td>
                        {d.items.length === 0 ? (
                          <span className="muted">Rest</span>
                        ) : (
                          d.items.map((item) => (
                            <div className="plan-line" key={item.exercise}>
                              <strong>{label(item.exercise)}</strong> · {item.sets} × {item.reps_per_set} ·
                              target {item.target_score}+
                              <div className="muted small">{item.focus}</div>
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="spaced">
            <Link to="/workout" className="btn">
              Start a workout
            </Link>
          </p>
        </>
      )}
    </>
  );
}

export default function PlansPage() {
  const { user } = useAuth();
  return user?.role === "premium" ? <AdaptivePlan /> : <LockedPlan />;
}
