import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { billingApi, type CheckoutInfo } from "../api/billing";
import { useAuth } from "../auth/useAuth";
import { formatMoney } from "../lib/format";
import { formatCardNumber, isTestCard, TEST_CARDS } from "../lib/testCards";

/** The hosted payment page of the SANDBOX provider. */
export default function CheckoutPage() {
  const { checkoutId } = useParams();
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  const [loadError, setLoadError] = useState("");

  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!checkoutId) return;

    let cancelled = false;
    billingApi
      .getCheckout(checkoutId)
      .then((c) => {
        if (!cancelled) setInfo(c);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load this checkout");
      });
    return () => {
      cancelled = true;
    };
  }, [checkoutId]);

  async function handlePay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!checkoutId) return;
    setError("");

    const digits = card.replace(/\s/g, "");
    // Real card numbers are stopped here and never leave the browser.
    if (!isTestCard(digits)) {
      setError("This is a sandbox: only the test cards below work. Never enter a real card.");
      return;
    }
    const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(expiry.trim());
    if (!match) {
      setError("Enter the expiry date as MM/YY, for example 12/30.");
      return;
    }

    setPaying(true);
    try {
      const result = await billingApi.pay(checkoutId, {
        card_number: digits,
        exp_month: Number(match[1]),
        exp_year: Number(match[2]),
        cvc,
        cardholder: name.trim(),
      });
      updateUser(result.user); // the navbar and pages now see the Premium role
      navigate("/plans", { replace: true, state: { justUpgraded: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  if (loadError) {
    return (
      <div className="card center-card">
        <h1>Checkout not found</h1>
        <p className="muted">{loadError}</p>
        <Link to="/premium" className="btn">
          Back to Premium
        </Link>
      </div>
    );
  }
  if (info === null) return <p className="muted">Loading checkout...</p>;

  if (info.status === "paid") {
    return (
      <div className="card center-card">
        <h1>Already paid</h1>
        <p className="muted">This checkout has been paid.</p>
        <Link to="/plans" className="btn">
          Go to my plan
        </Link>
      </div>
    );
  }

  return (
    <div className="card center-card checkout">
      <p className="sandbox-banner">SANDBOX: no real money is charged. Never enter a real card.</p>
      <h1>Checkout</h1>
      <p className="checkout-summary">
        <span>{info.description}</span>
        <strong>{formatMoney(info.amount_cents, info.currency)}</strong>
      </p>

      <form className="form" onSubmit={handlePay}>
        <label>
          Card number
          <input
            value={card}
            onChange={(e) => setCard(formatCardNumber(e.target.value))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="4242 4242 4242 4242"
            required
          />
        </label>
        <div className="two-cols">
          <label>
            Expiry (MM/YY)
            <input
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              autoComplete="off"
              placeholder="12/30"
              maxLength={5}
              required
            />
          </label>
          <label>
            CVC
            <input
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="123"
              required
            />
          </label>
        </div>
        <label>
          Name on card
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={paying}>
          {paying ? "Processing..." : `Pay ${formatMoney(info.amount_cents, info.currency)}`}
        </button>
      </form>

      <div className="test-cards">
        <strong>Test cards</strong> (any future expiry, any 3 digits)
        <ul>
          {TEST_CARDS.map((c) => (
            <li key={c.number}>
              <code>{c.number}</code> → {c.result}
            </li>
          ))}
        </ul>
      </div>
      <Link to="/premium" className="link">
        Cancel and go back
      </Link>
    </div>
  );
}
