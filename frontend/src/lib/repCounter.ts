import type { ExerciseConfig } from "./exercises";

export type Stage = "unknown" | "extended" | "contracted";

export interface CounterState {
  angle: number;
  reps: number;
  stage: Stage;
}

/**
 * Simple state machine:
 *   extended -> contracted -> extended  =  1 rep
 * The angle is smoothed (exponential moving average) to remove camera jitter.
 */
export class RepCounter {
  reps = 0;
  stage: Stage = "unknown";

  private cfg: ExerciseConfig;
  private alpha: number;
  private smoothed: number | null = null;

  constructor(cfg: ExerciseConfig, alpha = 0.4) {
    this.cfg = cfg;
    this.alpha = alpha;
  }

  update(rawAngle: number): CounterState {
    this.smoothed =
      this.smoothed === null
        ? rawAngle
        : this.alpha * rawAngle + (1 - this.alpha) * this.smoothed;
    const angle = this.smoothed;

    if (angle > this.cfg.extendedAbove) {
      if (this.stage === "contracted") this.reps += 1; // finished a full rep
      this.stage = "extended";
    } else if (angle < this.cfg.contractedBelow && this.stage === "extended") {
      this.stage = "contracted";
    }

    return { angle, reps: this.reps, stage: this.stage };
  }

  reset(): void {
    this.reps = 0;
    this.stage = "unknown";
    this.smoothed = null;
  }
}
