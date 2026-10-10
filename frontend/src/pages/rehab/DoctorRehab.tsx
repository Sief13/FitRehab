import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rehabApi, type CareLink } from "../../api/rehab";
import Disclaimer from "../../components/Disclaimer";
import { formatDate } from "../../lib/format";

export default function DoctorRehab() {
  const [links, setLinks] = useState<CareLink[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    rehabApi
      .links()
      .then((l) => {
        if (cancelled) return;
        setLinks(l);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your patients");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function handleDisconnect(link: CareLink) {
    if (!window.confirm(`Disconnect from ${link.person.name}? You will lose access to their data.`)) return;
    void run(() => rehabApi.removeLink(link.id));
  }

  const pending = links?.filter((l) => l.status === "pending") ?? [];
  const patients = links?.filter((l) => l.status === "active") ?? [];

  return (
    <>
      <h1>Patients</h1>
      <Disclaimer />

      {error && (
        <p className="form-error spaced">
          {error}{" "}
          <button className="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </p>
      )}
      {links === null && !error && <p className="muted">Loading...</p>}

      {pending.length > 0 && (
        <>
          <h2 className="section-title">Requests ({pending.length})</h2>
          <div className="card">
            {pending.map((link) => (
              <div className="list-row" key={link.id}>
                <div>
                  <strong>{link.person.name}</strong>
                  <div className="muted small">
                    {link.person.email} · requested {formatDate(link.created_at)}
                  </div>
                </div>
                <div className="row-actions">
                  <button onClick={() => void run(() => rehabApi.accept(link.id))}>Accept</button>
                  <button className="link-btn" onClick={() => void run(() => rehabApi.removeLink(link.id))}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">My patients</h2>
      <div className="card">
        {links && patients.length === 0 && (
          <p className="empty">
            No patients yet. Ask your patients to send you a request using your account email.
          </p>
        )}
        {patients.map((link) => (
          <div className="list-row" key={link.id}>
            <div>
              <strong>{link.person.name}</strong>
              <div className="muted small">{link.person.email}</div>
            </div>
            <div className="row-actions">
              <Link to={`/rehab/patients/${link.id}`} className="btn">
                Open
              </Link>
              <button className="link-btn" onClick={() => handleDisconnect(link)}>
                Disconnect
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
