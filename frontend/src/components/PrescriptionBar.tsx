import type { PlanItem } from "../api/rehab";
import { toneAgainstTarget } from "../lib/format";
import { EXERCISES } from "../lib/exercises";

/** Shown above the camera when the workout was started from a rehab plan. */
export default function PrescriptionBar({
  item,
  repsDone,
  averageScore,
}: {
  item: PlanItem;
  repsDone: number;
  averageScore: number | null;
}) {
  const totalReps = item.sets * item.reps_per_set;
  const percent = Math.min(100, Math.round((repsDone / totalReps) * 100));

  return (
    <div className="prescription">
      <div>
        <strong>Prescribed:</strong> {EXERCISES[item.exercise].label} · {item.sets} sets ×{" "}
        {item.reps_per_set} reps ({totalReps} in total) · target score {item.target_score}+
      </div>
      <div className="bar-row">
        <span>
          Reps {repsDone}/{totalReps}
        </span>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="bar-value">{percent}%</span>
      </div>
      <div className="muted small no-margin">
        Do your sets one after another and rest when you need to. Average score so far:{" "}
        <span
          className={
            averageScore === null
              ? ""
              : `score tone-${toneAgainstTarget(averageScore, item.target_score)}`
          }
        >
          {averageScore ?? "-"}
        </span>
      </div>
    </div>
  );
}
