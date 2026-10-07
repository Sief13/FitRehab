import type { ExerciseConfig } from "./exercises";

export type Stage = "unknown" | "extended" | "contracted";

export interface CounterState {
  angle: number;
  posture: number;
  reps: number;
  stage: Stage;
}

/** Measurements collected between leaving the top position and returning to it */
export interface RepSummary {
  minAngle: number;
  maxPosture: number;
  durationMs: number;
}

export type RepEvent =
  | { type: "rep"; summary: RepSummary } // full rep, counted
  | { type: "partial"; summary: RepSummary }; // went down but not far enough, not counted

export interface UpdateResult {
  state: CounterState;
  event: RepEvent | null;
}

/** The joint must bend this many degrees below "extended" before we start timing a rep */
const MOTION_START_MARGIN = 20;
/** Movements shorter than this are treated as jitter, not as a partial rep */
const MIN_PARTIAL_MS = 400;

/**
 * State machine:  extended -> contracted -> extended  =  1 rep.
 * While the joint is away from the top position we also record the deepest angle,
 * the worst posture deviation and the time taken, so the rep can be scored.
 */
export class RepCounter {
  reps = 0;
  stage: Stage = "unknown";

  private cfg: ExerciseConfig;
  private alpha: number;
  private angle: number | null = null;
  private posture: number | null = null;

  private windowStart: number | null = null;
  private windowMinAngle = 180;
  private windowMaxPosture = 0;

  constructor(cfg: ExerciseConfig, alpha = 0.4) {
    this.cfg = cfg;
    this.alpha = alpha;
  }

  update(rawAngle: number, rawPosture: number, nowMs: number): UpdateResult {
    // exponential moving average removes camera jitter
    this.angle =
      this.angle === null ? rawAngle : this.alpha * rawAngle + (1 - this.alpha) * this.angle;
    this.posture =
      this.posture === null
        ? rawPosture
        : this.alpha * rawPosture + (1 - this.alpha) * this.posture;

    const angle = this.angle;
    const posture = this.posture;
    const cfg = this.cfg;
    let event: RepEvent | null = null;

    if (angle > cfg.extendedAbove) {
      // back at the top position
      if (this.windowStart !== null) {
        const summary: RepSummary = {
          minAngle: this.windowMinAngle,
          maxPosture: this.windowMaxPosture,
          durationMs: nowMs - this.windowStart,
        };
        if (this.stage === "contracted") {
          this.reps += 1;
          event = { type: "rep", summary };
        } else if (this.stage === "extended" && summary.durationMs >= MIN_PARTIAL_MS) {
          event = { type: "partial", summary };
        }
        this.windowStart = null;
      }
      this.stage = "extended";
    } else {
      // open a measuring window when the movement really starts
      if (
        this.windowStart === null &&
        this.stage === "extended" &&
        angle < cfg.extendedAbove - MOTION_START_MARGIN
      ) {
        this.windowStart = nowMs;
        this.windowMinAngle = angle;
        this.windowMaxPosture = posture;
      }
      if (this.windowStart !== null) {
        this.windowMinAngle = Math.min(this.windowMinAngle, angle);
        this.windowMaxPosture = Math.max(this.windowMaxPosture, posture);
      }
      if (angle < cfg.contractedBelow && this.stage === "extended") {
        this.stage = "contracted";
      }
    }

    return {
      state: { angle, posture, reps: this.reps, stage: this.stage },
      event,
    };
  }

  reset(): void {
    this.reps = 0;
    this.stage = "unknown";
    this.angle = null;
    this.posture = null;
    this.windowStart = null;
    this.windowMinAngle = 180;
    this.windowMaxPosture = 0;
  }
}
