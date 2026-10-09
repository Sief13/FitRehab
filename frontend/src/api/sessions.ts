import type { ExerciseKey } from "../lib/exercises";
import type { RepResult } from "../lib/scoring";
import { request } from "./client";

export interface RepPayload {
  score: number;
  rom: number;
  posture: number;
  tempo: number;
  duration_ms: number;
  min_angle: number;
}

export interface SessionPayload {
  exercise: ExerciseKey;
  started_at: string; // ISO time, e.g. 2026-10-09T10:15:00.000Z
  duration_sec: number;
  reps: RepPayload[];
}

export interface SessionSummary {
  id: number;
  exercise: string;
  started_at: string;
  duration_sec: number;
  rep_count: number;
  avg_score: number;
  avg_rom: number;
  avg_posture: number;
  avg_tempo: number;
}

export interface RepDetail {
  rep_index: number;
  score: number;
  rom: number;
  posture: number;
  tempo: number;
  duration_ms: number;
  min_angle: number;
}

export interface SessionDetail extends SessionSummary {
  reps: RepDetail[];
}

export interface Stats {
  total_sessions: number;
  total_reps: number;
  sessions_last_7_days: number;
  average_score: number | null;
  streak_days: number;
}

/** Turns the reps scored in the browser into the JSON the server expects (within its limits). */
export function buildSessionPayload(
  exercise: ExerciseKey,
  startedAtMs: number,
  endedAtMs: number,
  results: RepResult[],
): SessionPayload {
  return {
    exercise,
    started_at: new Date(startedAtMs).toISOString(),
    duration_sec: Math.min(86_400, Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000))),
    reps: results.slice(0, 500).map((r) => ({
      score: r.score,
      rom: r.rom,
      posture: r.posture,
      tempo: r.tempo,
      duration_ms: Math.min(600_000, Math.max(0, Math.round(r.durationMs))),
      min_angle: r.minAngle,
    })),
  };
}

export const sessionsApi = {
  create: (payload: SessionPayload) =>
    request<SessionDetail>("/api/sessions", { method: "POST", body: JSON.stringify(payload) }),

  list: (limit = 10, offset = 0) =>
    request<SessionSummary[]>(`/api/sessions?limit=${limit}&offset=${offset}`),

  get: (id: number) => request<SessionDetail>(`/api/sessions/${id}`),

  remove: (id: number) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),

  /** tzOffset = minutes east of UTC (browser: -new Date().getTimezoneOffset()) */
  stats: (tzOffset: number) => request<Stats>(`/api/stats?tz_offset=${tzOffset}`),
};
