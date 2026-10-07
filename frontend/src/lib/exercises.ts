export type ExerciseKey = "squat" | "bicep_curl";

export interface ExerciseConfig {
  label: string;
  /** MediaPipe landmark indices [A, vertex B, C] for the left and right side */
  left: [number, number, number];
  right: [number, number, number];
  /** Angle below which the joint counts as "contracted" (bottom of squat / top of curl) */
  contractedBelow: number;
  /** Angle above which the joint counts as "extended" (standing / arm straight) */
  extendedAbove: number;
}

/*
 MediaPipe Pose landmark indices used here:
 11/12 shoulders, 13/14 elbows, 15/16 wrists,
 23/24 hips, 25/26 knees, 27/28 ankles   (odd = left, even = right)
*/
export const EXERCISES: Record<ExerciseKey, ExerciseConfig> = {
  squat: {
    label: "Squat",
    left: [23, 25, 27],
    right: [24, 26, 28],
    contractedBelow: 100,
    extendedAbove: 160,
  },
  bicep_curl: {
    label: "Bicep curl",
    left: [11, 13, 15],
    right: [12, 14, 16],
    contractedBelow: 50,
    extendedAbove: 150,
  },
};
