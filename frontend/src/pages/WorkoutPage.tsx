import PoseCamera from "../components/PoseCamera";

export default function WorkoutPage() {
  return (
    <>
      <h1>Workout</h1>
      <p className="muted">
        Pick an exercise, press start, and the AI will count and score your reps. Everything runs
        in your browser; no video is uploaded.
      </p>
      <PoseCamera />
    </>
  );
}
