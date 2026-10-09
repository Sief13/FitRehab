// SAMPLE DATA: the real adaptive plan is generated from your sessions in a later step.
const PLAN = [
  { day: "Monday", work: "Squat · 3 sets of 10" },
  { day: "Tuesday", work: "Bicep curl · 3 sets of 12" },
  { day: "Wednesday", work: "Rest" },
  { day: "Thursday", work: "Squat · 4 sets of 10" },
  { day: "Friday", work: "Bicep curl · 4 sets of 10" },
  { day: "Saturday", work: "Mixed · 20 min" },
  { day: "Sunday", work: "Rest" },
];

export default function PlansPage() {
  return (
    <>
      <h1>My plan</h1>
      <p className="muted">
        Premium plan preview. Later it will adapt automatically to your performance scores.
      </p>
      <div className="card">
        <table className="reps">
          <tbody>
            {PLAN.map((p) => (
              <tr key={p.day}>
                <td>{p.day}</td>
                <td>{p.work}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
