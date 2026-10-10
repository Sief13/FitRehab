import type { ExerciseKey } from "../lib/exercises";
import { request } from "./client";
import type { SessionDetail, SessionSummary, Stats } from "./sessions";

export interface Person {
  id: number;
  name: string;
  email: string;
}

/** A connection between a patient and a physiatrist. `person` is always the OTHER party. */
export interface CareLink {
  id: number;
  status: "pending" | "active";
  created_at: string;
  person: Person;
}

export interface ItemProgress {
  sessions: number;
  total_reps: number;
  average_score: number | null;
  last_done_at: string | null;
}

export interface PlanItem {
  id: number;
  exercise: ExerciseKey;
  sets: number;
  reps_per_set: number;
  target_score: number;
  progress: ItemProgress;
}

export interface Plan {
  id: number;
  title: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  physiatrist: Person;
  items: PlanItem[];
}

export interface PlanItemDraft {
  exercise: ExerciseKey;
  sets: number;
  reps_per_set: number;
  target_score: number;
}

export interface PlanDraft {
  title: string;
  notes: string;
  items: PlanItemDraft[];
}

export interface PatientOverview {
  link: CareLink;
  stats: Stats;
  plan: Plan | null;
  sessions: SessionSummary[];
}

export const rehabApi = {
  // both sides
  links: () => request<CareLink[]>("/api/rehab/links"),
  removeLink: (linkId: number) => request<void>(`/api/rehab/links/${linkId}`, { method: "DELETE" }),

  // patient side
  requestLink: (physiatristEmail: string) =>
    request<CareLink>("/api/rehab/links", {
      method: "POST",
      body: JSON.stringify({ physiatrist_email: physiatristEmail }),
    }),
  myPlans: () => request<Plan[]>("/api/rehab/my-plans"),

  // physiatrist side
  accept: (linkId: number) =>
    request<CareLink>(`/api/rehab/links/${linkId}/accept`, { method: "POST" }),
  patientOverview: (linkId: number, tzOffset: number) =>
    request<PatientOverview>(`/api/rehab/patients/${linkId}?tz_offset=${tzOffset}`),
  patientSession: (linkId: number, sessionId: number) =>
    request<SessionDetail>(`/api/rehab/patients/${linkId}/sessions/${sessionId}`),
  createPlan: (linkId: number, draft: PlanDraft) =>
    request<Plan>(`/api/rehab/patients/${linkId}/plans`, {
      method: "POST",
      body: JSON.stringify(draft),
    }),
};
