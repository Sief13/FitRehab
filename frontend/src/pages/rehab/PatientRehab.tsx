import { useEffect, useState, type FormEvent } from "react";
import { rehabApi, type CareLink, type Plan } from "../../api/rehab";
import Disclaimer from "../../components/Disclaimer";
import PlanCard from "../../components/PlanCard";

export default function PatientRehab() {
  const [links, setLinks] = useState<CareLink[] | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [formInfo, setFormInfo] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([rehabApi.links(), rehabApi.myPlans()])
      .then(([l, p]) => {
        if (cancelled) return;
        setLinks(l);
        setPlans(p);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your data");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setFormError("");
    setFormInfo("");
    try {
      await rehabApi.requestLink(email.trim());
      setEmail("");
      setFormInfo("Request sent. Your physiatrist must accept it before they can see your workouts.");
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send the request");
    } finally {
      setSending(false);
    }
  }

  async function handleRemove(link: CareLink) {
    const question =
      link.status === "pending"
        ? `Cancel your request to ${link.person.name}?`
        : `Disconnect from ${link.person.name}? They will no longer see your workouts, and their plan for you will be removed.`;
    if (!window.confirm(question)) return;
    try {
      await rehabApi.removeLink(link.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the connection");
    }
  }

  return (
    <>
      <h1>My rehabilitation</h1>
      <Disclaimer />

      {error && (
        <p className="form-error spaced">
          {error}{" "}
          <button className="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </p>
      )}

      <h2 className="section-title">My plan</h2>
      {plans === null && !error && <p className="muted">Loading...</p>}
      {plans && plans.length === 0 && (
        <div className="card">
          <p className="empty">
            No plan yet. Once a physiatrist accepts your request and assigns exercises, they appear
            here.
          </p>
        </div>
      )}
      {plans?.map((plan) => <PlanCard key={plan.id} plan={plan} mode="patient" />)}

      <h2 className="section-title">My physiatrist</h2>
      <div className="card">
        {links && links.length === 0 && <p className="empty">You are not connected to a physiatrist.</p>}
        {links?.map((link) => (
          <div className="list-row" key={link.id}>
            <div>
              <strong>{link.person.name}</strong>
              <div className="muted small">{link.person.email}</div>
            </div>
            <div className="row-actions">
              <span className={`pill ${link.status}`}>
                {link.status === "pending" ? "Waiting for acceptance" : "Connected"}
              </span>
              <button className="link-btn" onClick={() => handleRemove(link)}>
                {link.status === "pending" ? "Cancel" : "Disconnect"}
              </button>
            </div>
          </div>
        ))}

        <form className="inline-form" onSubmit={handleRequest}>
          <label>
            Connect to a physiatrist by email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@clinic.com"
              required
            />
          </label>
          <button type="submit" disabled={sending}>
            {sending ? "Sending..." : "Send request"}
          </button>
        </form>
        <p className="muted small no-margin">
          Once connected, your physiatrist can see all your saved workouts and scores. You can
          disconnect at any time.
        </p>
        {formError && <p className="form-error spaced">{formError}</p>}
        {formInfo && <p className="form-ok spaced">{formInfo}</p>}
      </div>
    </>
  );
}
