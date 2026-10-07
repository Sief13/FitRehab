import PoseCamera from "./components/PoseCamera";

export default function App() {
  return (
    <main className="container">
      <h1>AI Fitness &amp; Rehab — Pose Test</h1>
      <p className="muted">
        Stand 2–3 meters from the camera so your whole body is visible
        (for curls, your upper body is enough). Everything runs in your browser.
      </p>
      <PoseCamera />
    </main>
  );
}
