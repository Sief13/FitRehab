import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { rehabApi, type PlanItem } from "../api/rehab";
import PoseCamera from "../components/PoseCamera";

type PlanState =
  | { status: "loading" }
  | { status: "ready"; item: PlanItem | null }
  | { status: "error"; message: string };

/** Free workout, or a prescribed rehab exercise when the URL has ?item=<plan item id>. */
function PlannedWorkout({ itemId }: { itemId: number | null }) {
  const [state, setState] = useState<PlanState>(
    itemId === null ? { status: "ready", item: null } : { status: "loading" },
  );

  useEffect(() => {
    if (itemId === null) return;

    let cancelled = false;
    rehabApi
      .myPlans()
      .then((plans) => {
        if (cancelled) return;
        const item = plans.flatMap((p) => p.items).find((i) => i.id === itemId);
        setState(
          item
            ? { status: "ready", item }
            : { status: "error", message: "That exercise is not part of your active rehab plan." },
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Could not load your plan",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  if (state.status === "loading") return <p className="muted">Loading your prescribed exercise...</p>;

  if (state.status === "error") {
    return (
      <>
        <p className="form-error">{state.message}</p>
        <p>
          <Link to="/rehab" className="link">
            Back to my rehabilitation
          </Link>
        </p>
      </>
    );
  }

  return <PoseCamera planItem={state.item ?? undefined} />;
}

export default function WorkoutPage() {
  const [params] = useSearchParams();
  const raw = params.get("item");
  const itemId = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;

  return (
    <>
      <h1>{itemId === null ? "Workout" : "Rehab workout"}</h1>
      <p className="muted">
        Press start and the AI will count and score your reps. Everything runs in your browser; no
        video is uploaded.
      </p>
      <PlannedWorkout key={itemId ?? "free"} itemId={itemId} />
    </>
  );
}
