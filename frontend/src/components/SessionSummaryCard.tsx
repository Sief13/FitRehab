import { scoreTone, type SessionSummary } from "../lib/scoring";

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className="bar">
        <div
          className={`bar-fill tone-${scoreTone(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="bar-value">{value}</span>
    </div>
  );
}

export default function SessionSummaryCard({ summary }: { summary: SessionSummary }) {
  return (
    <div className="summary">
      <h2>Session summary</h2>
      <div className="summary-top">
        <div className={`big-score tone-${scoreTone(summary.averageScore)}`}>
          <span className="score">{summary.averageScore}</span>
          <span className="hud-label">average score</span>
        </div>
        <ul className="facts">
          <li>{summary.reps} reps in {summary.durationSec}s</li>
          <li>Best rep: {summary.bestScore}</li>
          <li>Worst rep: {summary.worstScore}</li>
        </ul>
      </div>

      <Bar label="Depth / range" value={summary.avgRom} />
      <Bar label="Posture" value={summary.avgPosture} />
      <Bar label="Tempo" value={summary.avgTempo} />

      <p className="focus">
        {summary.topIssue
          ? `Main thing to work on: ${summary.topIssue}`
          : "Clean session: no recurring issues."}
      </p>
    </div>
  );
}
