import { useState, type FormEvent } from "react";
import type { PlanDraft, PlanItemDraft } from "../api/rehab";
import { EXERCISES, type ExerciseKey } from "../lib/exercises";

const NEW_ITEM: PlanItemDraft = { exercise: "squat", sets: 3, reps_per_set: 10, target_score: 80 };

export default function PlanForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (draft: PlanDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PlanItemDraft[]>([{ ...NEW_ITEM }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateItem(index: number, patch: Partial<PlanItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({ title: title.trim(), notes: notes.trim(), items });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form plan-form" onSubmit={handleSubmit}>
      <h2>New plan</h2>
      <p className="muted small no-margin">
        Assigning a new plan replaces the patient's current plan.
      </p>

      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="e.g. Knee recovery, week 3"
          required
        />
      </label>

      <label>
        Notes for the patient (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="e.g. Slow and controlled. Stop if you feel sharp pain."
        />
      </label>

      <div className="item-list">
        {items.map((item, index) => (
          <div className="item-row" key={index}>
            <label>
              Exercise
              <select
                value={item.exercise}
                onChange={(e) => updateItem(index, { exercise: e.target.value as ExerciseKey })}
              >
                {Object.entries(EXERCISES).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sets
              <input
                type="number"
                min={1}
                max={10}
                value={item.sets}
                onChange={(e) => updateItem(index, { sets: Number(e.target.value) })}
                required
              />
            </label>
            <label>
              Reps per set
              <input
                type="number"
                min={1}
                max={50}
                value={item.reps_per_set}
                onChange={(e) => updateItem(index, { reps_per_set: Number(e.target.value) })}
                required
              />
            </label>
            <label>
              Target score
              <input
                type="number"
                min={0}
                max={100}
                value={item.target_score}
                onChange={(e) => updateItem(index, { target_score: Number(e.target.value) })}
                required
              />
            </label>
            <button
              type="button"
              className="link-btn"
              disabled={items.length === 1}
              onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        {items.length < 10 && (
          <button
            type="button"
            className="secondary"
            onClick={() => setItems((prev) => [...prev, { ...NEW_ITEM }])}
          >
            + Add exercise
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="toolbar">
        <button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Assign plan"}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
