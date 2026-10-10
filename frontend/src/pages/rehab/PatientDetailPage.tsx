import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { rehabApi, type PatientOverview, type PlanDraft } from "../../api/rehab";
import type { SessionDetail } from "../../api/sessions";
import Disclaimer from "../../components/Disclaimer";
import PlanCard from "../../components/PlanCard";
import PlanForm from "../../components/PlanForm";
import { exerciseLabel, formatDate, formatDuration } from "../../lib/format";
import { scoreTone } from "../../lib/scoring";

type DetailState = SessionDetail | "loading" | "error";

export default function PatientDetailPage() {
  const { linkId } = useParams();
  const valid = linkId !== undefined && /^\d+$/.test(linkId);
  const id = valid ? Number(linkId) : 0;

  const [data, setData] = useState<PatientOverview | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, DetailState>>({});

  useEffect(() => {
    if (!valid) return;

    let cancelled = false;
    const tzOffset = -new Date().getTimezoneOffset(); // minutes east of UTC
    rehabApi
      .patientOverview(id, tzOffset)
      .then((overview) => {
        if (cancelled) return;
        setData(overview);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this patient");
      });
    return () => {
      cancelled = true;
    };
  }, [id, valid, reloadKey]);

  async function assignPlan(draft: PlanDraft) {
    await rehabApi.createPlan(id, draft);
    setShowForm(false);
    setReloadKey((k) => k + 1);
  }

  async function toggleSession(sessionId: number) {
    if (openId === sessionId) {
      setOpenId(null);
      return;
    }
    setOpenId(sessionId);
    if (details[sessionId] !== undefined && details[sessionId] !== "error") return;

    setDetails((prev) => ({ ...prev, [sessionId]: "loading" }));
    try {
      const detail = await rehabApi.patientSession(id, sessionId);
      setDetails((prev) => ({ ...prev, [sessionId]: detail }));
    } catch {
      setDetails((prev) => ({ ...prev, [sessionId]: "error" }));
    }
  }

  if (!valid) {
    return (
      <>
        <p className="form-error">Invalid patient link.</p>
        <Link to="/rehab" className="link">Back to patients</Link>
      </>
    );
  }

  const stats = data?.stats;
  const cards = [
    { label: "Workouts (last 7 days)", value: stats ? String(stats.sessions_last_7_days) : "-" },
    {
      label: "Average form score",
      value: stats?.average_score != null ? String(Math.round(stats.average_score)) : "-",
    },
    { label: "Total reps", value: stats ? String(stats.total_reps) : "-" },
    { label: "Day streak", value: stats ? String(stats.streak_days) : "-" },
  ];

  return (
    <>
      <p className="no-margin">
        <Link to="/rehab" className="link">← All patients</Link>
      </p>
      <h1>{data ? data.link.person.name : "Patient"}</h1>
      {data && <p className="muted">{data.link.person.email}</p>}
      <Disclaimer />

      {error && (
        <p className="form-error spaced">
          {error}{" "}
          <button className="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </p>
      )}
      {data === null && !error && <p className="muted">Loading...</p>}

      {data && (
        <>
          <section className="grid-4">
            {cards.map((c) => (
              <div className="card stat" key={c.label}>
                <span className="stat-value">{c.value}</span>
                <span className="hud-label">{c.label}</span>
              </div>
            ))}
          </section>

          <div className="section-head">
            <h2 className="section-title">Current plan</h2>
            {!showForm && (
              <button onClick={() => setShowForm(true)}>
                {data.plan ? "Assign a new plan" : "Assign a plan"}
              </button>
            )}
          </div>
          {showForm && <PlanForm onSubmit={assignPlan} onCancel={() => setShowForm(false)} />}
          {data.plan ? (
            <PlanCard plan={data.plan} mode="doctor" />
          ) : (
            !showForm && (
              <div className="card">
                <p className="empty">No plan assigned yet.</p>
              </div>
            )
          )}

          <h2 className="section-title">Recent workouts</h2>
          <div className="card">
            {data.sessions.length === 0 ? (
              <p className="empty">This patient has not saved any workouts yet.</p>
            ) : (
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
                  {data.sessions.flatMap((s) => {
                    const detail = details[s.id];
                    const rows = [
                      <tr key={s.id}>
                        <td>{formatDate(s.started_at)}</td>
                        <td>
                          {exerciseLabel(s.exercise)}
                          {s.plan_item_id !== null && <span className="pill plan">Plan</span>}
                        </td>
                        <td>{s.rep_count}</td>
                        <td className={`score tone-${scoreTone(Math.round(s.avg_score))}`}>
                          {Math.round(s.avg_score)}
                        </td>
                        <td>{formatDuration(s.duration_sec)}</td>
                        <td className="actions">
                          <button className="link-btn neutral" onClick={() => void toggleSession(s.id)}>
                            {openId === s.id ? "Hide reps" : "Show reps"}
                          </button>
                        </td>
                      </tr>,
                    ];
                    if (openId === s.id) {
                      rows.push(
                        <tr key={`${s.id}-reps`} className="reps-detail">
                          <td colSpan={6}>
                            {detail === "loading" || detail === undefined ? (
                              <span className="muted">Loading reps...</span>
                            ) : detail === "error" ? (
                              <span className="form-error">Could not load the reps.</span>
                            ) : (
                              <table className="reps">
                                <thead>
                                  <tr>
                                    <th>Rep</th>
                                    <th>Score</th>
                                    <th>Depth</th>
                                    <th>Posture</th>
                                    <th>Tempo</th>
                                    <th>Time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.reps.map((r) => (
                                    <tr key={r.rep_index}>
                                      <td>{r.rep_index}</td>
                                      <td className={`score tone-${scoreTone(r.score)}`}>{r.score}</td>
                                      <td>{r.rom}</td>
                                      <td>{r.posture}</td>
                                      <td>{r.tempo}</td>
                                      <td>{(r.duration_ms / 1000).toFixed(1)}s</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>,
                      );
                    }
                    return rows;
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
