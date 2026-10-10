import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { billingApi, type BillingStatus, type Payment } from "../api/billing";
import { formatMoney, formatShortDate } from "../lib/format";

const BENEFITS = [
  "A 4-week training plan built from your own workouts",
  "Weekly progression, with a lighter recovery week",
  "Coaching focus on your weakest area: depth, posture or tempo",
  "An extra technique day for your weaker exercise",
];

export default function PremiumPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([billingApi.status(), billingApi.payments()])
      .then(([s, p]) => {
        if (cancelled) return;
        setStatus(s);
        setPayments(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your plan");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startCheckout() {
    setStarting(true);
    setError("");
    try {
      const { checkout_id } = await billingApi.createCheckout();
      navigate(`/checkout/${checkout_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the checkout");
      setStarting(false);
    }
  }

  return (
    <>
      <h1>Premium</h1>
      <p className="muted">Training that adapts to how you actually perform.</p>

      {error && <p className="form-error">{error}</p>}
      {status === null && !error && <p className="muted">Loading...</p>}

      {status && (
        <div className="card pricing">
          <div className="pricing-price">
            <span className="stat-value">{formatMoney(status.price_cents, status.currency)}</span>
            <span className="muted"> for {status.period_days} days</span>
          </div>

          <ul className="benefits">
            {BENEFITS.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>

          {status.is_premium && status.premium_until ? (
            <p className="form-ok">You are Premium until {formatShortDate(status.premium_until)}.</p>
          ) : (
            <p className="muted small no-margin">You are on the Free plan.</p>
          )}

          <div className="toolbar spaced">
            <button onClick={startCheckout} disabled={starting}>
              {starting
                ? "Please wait..."
                : status.is_premium
                  ? `Add ${status.period_days} more days`
                  : "Upgrade to Premium"}
            </button>
          </div>
          <p className="muted small no-margin">
            Payments here use a sandbox: no real money is charged. Premium is not renewed
            automatically; it simply ends when the paid period ends.
          </p>
        </div>
      )}

      {payments.length > 0 && (
        <>
          <h2 className="section-title">Payment history</h2>
          <div className="card">
            <table className="reps">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Card</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatShortDate(p.paid_at ?? p.created_at)}</td>
                    <td>{p.description}</td>
                    <td>{formatMoney(p.amount_cents, p.currency)}</td>
                    <td>{p.card_last4 ? `•••• ${p.card_last4}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
