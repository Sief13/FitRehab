import { EXERCISES, type ExerciseKey } from "./exercises";

export function exerciseLabel(key: string): string {
  return EXERCISES[key as ExerciseKey]?.label ?? key;
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Colour of a score compared with the physiatrist's target (not with fixed thresholds). */
export function toneAgainstTarget(score: number, target: number): "good" | "ok" | "bad" {
  if (score >= target) return "good";
  if (score >= target - 10) return "ok";
  return "bad";
}

/** 14900 + "EGP" -> "EGP 149.00" (the exact look depends on the browser's language) */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
