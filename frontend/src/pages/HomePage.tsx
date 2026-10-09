import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "Real-time AI coaching",
    text: "Your webcam tracks your joints and counts reps. You get a form score and instant corrections after every rep.",
  },
  {
    title: "Guided rehabilitation",
    text: "A physiatrist assigns your recovery exercises, and the AI checks that you perform them safely.",
  },
  {
    title: "Progress you can see",
    text: "Every session is saved, so you can follow your scores, consistency and improvement over time.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>
          Train smarter and recover safely with <span className="accent">AI</span>
        </h1>
        <p className="hero-text">
          A virtual fitness and rehabilitation coach that watches your movement through your
          camera. No wearables, no special equipment.
        </p>
        <div className="hero-actions">
          <Link to="/workout" className="btn big">
            Try a workout now
          </Link>
          <Link to="/register" className="btn big secondary">
            Create an account
          </Link>
        </div>
      </section>

      <section className="grid-3">
        {FEATURES.map((f) => (
          <div className="card" key={f.title}>
            <h2>{f.title}</h2>
            <p className="muted no-margin">{f.text}</p>
          </div>
        ))}
      </section>
    </>
  );
}
