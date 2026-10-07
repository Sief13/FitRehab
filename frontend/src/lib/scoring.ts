import type { ExerciseConfig } from "./exercises";
import type { RepSummary } from "./repCounter";

export type Issue = "rom" | "posture" | "tempo";
export type Tone = "good" | "ok" | "bad";

export interface RepResult {
  index: number; // 1-based rep number
  score: number; // 0-100
  rom: number; // range of motion (depth) 0-100
  posture: number; // 0-100
  tempo: number; // 0-100
  durationMs: number;
  minAngle: number;
  issues: Issue[];
  feedback: string[];
}

export interface SessionSummary {
  reps: number;
  averageScore: number;
  bestScore: number;
  worstScore: number;
  avgRom: number;
  avgPosture: number;
  avgTempo: number;
  durationSec: number;
  topIssue: string | null;
}

/* How much each part contributes to the rep score (sums to 1) */
const WEIGHTS = { rom: 0.5, posture: 0.3, tempo: 0.2 };

/* A part scoring below its threshold is reported as an issue */
const ISSUE_THRESHOLD: Record<Issue, number> = { rom: 75, posture: 70, tempo: 70 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function issueMessage(cfg: ExerciseConfig, issue: Issue): string {
  return issue === "rom" ? cfg.messages.shallow : cfg.messages[issue];
}

export function scoreTone(score: number): Tone {
  if (score >= 85) return "good";
  if (score >= 70) return "ok";
  return "bad";
}

export function scoreRep(cfg: ExerciseConfig, s: RepSummary, index: number): RepResult {
  // Depth: a counted rep earns 60; reaching fullFlexion earns 100
  const depthT = clamp01(
    (cfg.contractedBelow - s.minAngle) / (cfg.contractedBelow - cfg.fullFlexion),
  );
  const rom = 60 + 40 * depthT;

  // Posture: perfect up to `good` degrees of deviation, zero at `bad`
  const postureT = clamp01(
    (s.maxPosture - cfg.posture.good) / (cfg.posture.bad - cfg.posture.good),
  );
  const posture = 100 * (1 - postureT);

  // Tempo: full marks at idealRepSeconds or slower, zero at 40% of it or faster
  const seconds = s.durationMs / 1000;
  const tempo =
    100 * clamp01((seconds - cfg.idealRepSeconds * 0.4) / (cfg.idealRepSeconds * 0.6));

  const score = Math.round(rom * WEIGHTS.rom + posture * WEIGHTS.posture + tempo * WEIGHTS.tempo);

  const parts: Record<Issue, number> = { rom, posture, tempo };
  const issues = (Object.keys(parts) as Issue[]).filter(
    (k) => parts[k] < ISSUE_THRESHOLD[k],
  );
  const feedback =
    issues.length === 0 ? ["Great rep!"] : issues.map((i) => issueMessage(cfg, i));

  return {
    index,
    score,
    rom: Math.round(rom),
    posture: Math.round(posture),
    tempo: Math.round(tempo),
    durationMs: s.durationMs,
    minAngle: Math.round(s.minAngle),
    issues,
    feedback,
  };
}

export function summarizeSession(
  cfg: ExerciseConfig,
  results: RepResult[],
  durationMs: number,
): SessionSummary | null {
  if (results.length === 0) return null;

  const avg = (pick: (r: RepResult) => number) =>
    Math.round(results.reduce((sum, r) => sum + pick(r), 0) / results.length);

  const counts: Record<Issue, number> = { rom: 0, posture: 0, tempo: 0 };
  results.forEach((r) => r.issues.forEach((i) => (counts[i] += 1)));
  const [topIssue, topCount] = (Object.entries(counts) as [Issue, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];

  const scores = results.map((r) => r.score);
  return {
    reps: results.length,
    averageScore: avg((r) => r.score),
    bestScore: Math.max(...scores),
    worstScore: Math.min(...scores),
    avgRom: avg((r) => r.rom),
    avgPosture: avg((r) => r.posture),
    avgTempo: avg((r) => r.tempo),
    durationSec: Math.round(durationMs / 1000),
    topIssue: topCount > 0 ? issueMessage(cfg, topIssue) : null,
  };
}
