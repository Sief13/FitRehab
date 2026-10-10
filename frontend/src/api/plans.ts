import { request } from "./client";

export interface MonthlyPlanExercise {
  exercise: string;
  sets: number;
  reps_per_set: number;
  target_score: number;
  focus: string;
}

export interface MonthlyPlanDay {
  day: string; // "Mon" ... "Sun"
  items: MonthlyPlanExercise[]; // empty = rest day
}

export interface MonthlyPlanWeek {
  week: number;
  title: string;
  days: MonthlyPlanDay[];
}

export interface MonthlyPlanInsight {
  exercise: string;
  message: string;
}

export interface MonthlyPlan {
  generated_at: string;
  window_days: number;
  based_on_sessions: number;
  insights: MonthlyPlanInsight[];
  weeks: MonthlyPlanWeek[];
}

export const plansApi = {
  monthly: () => request<MonthlyPlan>("/api/plans/monthly"),
};
