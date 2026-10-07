export interface Point {
  x: number;
  y: number;
  visibility?: number;
}

/**
 * Angle (in degrees, 0-180) at vertex B formed by points A-B-C.
 * Example: hip-knee-ankle gives the knee angle.
 * Points must be in the SAME units on both axes (we convert to pixels first),
 * otherwise a non-square video would distort the angle.
 */
export function calculateAngle(a: Point, b: Point, c: Point): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return 180;

  const cos = Math.min(1, Math.max(-1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Average visibility of a set of landmarks (0-1). Used to pick the better-seen body side. */
export function averageVisibility(points: Point[]): number {
  if (points.length === 0) return 0;
  const sum = points.reduce((acc, p) => acc + (p.visibility ?? 0), 0);
  return sum / points.length;
}
