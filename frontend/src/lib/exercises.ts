import {
  averageVisibility,
  calculateAngle,
  tiltFromVertical,
  type Point,
} from "./geometry";

export type ExerciseKey = "squat" | "bicep_curl";
export type Side = "left" | "right";
export type JointName = "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle";
export type BodyPoints = Record<JointName, Point>;

/* MediaPipe Pose landmark indices for each side of the body */
export const SIDE_INDICES: Record<Side, Record<JointName, number>> = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
};

export interface ExerciseConfig {
  label: string;
  /** Where the user should stand */
  cameraHint: string;
  /** The three joints [A, vertex, C] whose angle drives rep counting */
  joints: [JointName, JointName, JointName];
  /** Angle below which the joint counts as "contracted" (bottom of squat / top of curl) */
  contractedBelow: number;
  /** Angle above which the joint counts as "extended" (standing / arm straight) */
  extendedAbove: number;
  /** Angle that earns 100% of the depth (range-of-motion) score */
  fullFlexion: number;
  /** Rep faster than ~40% of this is scored 0 for tempo; at or above it scores 100 */
  idealRepSeconds: number;
  posture: {
    /** Deviation (degrees) up to which posture is perfect */
    good: number;
    /** Deviation (degrees) at which the posture score reaches 0 */
    bad: number;
    /** Returns the posture deviation in degrees (lower is better) */
    measure: (body: BodyPoints) => number;
  };
  messages: {
    shallow: string;
    posture: string;
    tempo: string;
    partial: string;
  };
}

export const EXERCISES: Record<ExerciseKey, ExerciseConfig> = {
  squat: {
    label: "Squat",
    cameraHint: "Stand sideways to the camera with your whole body in view.",
    joints: ["hip", "knee", "ankle"],
    contractedBelow: 100,
    extendedAbove: 160,
    fullFlexion: 85,
    idealRepSeconds: 1.2,
    posture: {
      good: 40,
      bad: 70,
      // torso lean: shoulder-hip line vs vertical
      measure: (b) => tiltFromVertical(b.shoulder, b.hip),
    },
    messages: {
      shallow: "Go deeper: aim for thighs parallel to the floor.",
      posture: "Keep your chest up: you are leaning too far forward.",
      tempo: "Slow down and control the movement.",
      partial: "Partial rep (not counted): go deeper.",
    },
  },
  bicep_curl: {
    label: "Bicep curl",
    cameraHint:
      "Stand sideways to the camera, working arm toward it, upper body in view.",
    joints: ["shoulder", "elbow", "wrist"],
    contractedBelow: 50,
    extendedAbove: 150,
    fullFlexion: 35,
    idealRepSeconds: 1.2,
    posture: {
      good: 20,
      bad: 45,
      // elbow drift: shoulder-elbow (upper arm) line vs vertical
      measure: (b) => tiltFromVertical(b.shoulder, b.elbow),
    },
    messages: {
      shallow: "Curl all the way up and squeeze at the top.",
      posture: "Keep your elbow pinned to your side.",
      tempo: "Slow down: do not swing the weight.",
      partial: "Partial rep (not counted): curl higher.",
    },
  },
};

/** Choose the body side the camera sees better, based on the joints used by the exercise. */
export function pickSide(pose: Point[], joints: JointName[]): Side {
  const visibility = (side: Side) =>
    averageVisibility(joints.map((j) => pose[SIDE_INDICES[side][j]]));
  return visibility("left") >= visibility("right") ? "left" : "right";
}

/** Convert one side's normalized landmarks to pixel coordinates (so angles are not distorted). */
export function extractSide(
  pose: Point[],
  side: Side,
  width: number,
  height: number,
): BodyPoints {
  const out = {} as BodyPoints;
  (Object.keys(SIDE_INDICES[side]) as JointName[]).forEach((name) => {
    const p = pose[SIDE_INDICES[side][name]];
    out[name] = { x: p.x * width, y: p.y * height, visibility: p.visibility };
  });
  return out;
}

/** The main joint angle for rep counting (e.g. the knee angle for squats). */
export function measureAngle(cfg: ExerciseConfig, body: BodyPoints): number {
  const [a, b, c] = cfg.joints;
  return calculateAngle(body[a], body[b], body[c]);
}
