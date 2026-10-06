// AI-TOR "sol" maths: how the position of the home wheel maps onto the sun angle of the Mars background. Pure functions, no DOM, no imports.
// One full wheel turn = one Martian day ("sol"). sol angle in degrees: 0 = midnight, 90 = sunrise at the limb, 180 = noon, 270 = sunset.
// Every wheel entry (section) owns one ANCHOR: the sun angle shown when the wheel rests on it and the angle that is frozen behind the section once it is opened.
// Default anchor of entry i out of K = SOL_ORIGIN + i * 360 / K (so the first entry is sunrise and the rest are evenly spread around the day).
// An entry may pin its anchor with `sunAngle` (degrees); the anchors are then a strictly increasing sequence that spans exactly 360 degrees (entries between two pins are spread evenly),
// (v32: the app pins its 6 wheel entries to 90 sunrise / 110 morning / 180 noon / 255 late afternoon / 270 sunset / 0 night, i.e. anchors 90, 110, 180, 255, 270, 360, 450; the sun moves at different speeds between sections, one turn is still one sol),
// and the wheel angle is mapped piecewise-linearly between them, so the mapping stays continuous and one turn is still exactly one sol.
export const SOL_ORIGIN = 90;
export const norm360 = (d) => ((d % 360) + 360) % 360;

/** angles: array (length K) of optional `sunAngle` pins (number | undefined). Returns K+1 increasing anchors (the last one = first + 360).
 *  Pinned entries are fixed points; the entries between two fixed points are spread evenly between them (with no pins this is exactly 90 + i * 360 / K).
 *  Pins follow the wheel order: each one is unwrapped to the first angle at or after the previous fixed point. A pin that would leave less than 1 degree per entry
 *  (before it or after it, within one day) is ignored. */
export function buildAnchors(angles) {
  const K = Math.max(1, angles.length);
  const first = Number.isFinite(angles[0]) ? angles[0] : SOL_ORIGIN, limit = first + 360;
  const fixed = [[0, first]];
  for (let i = 1; i < K; i++) {
    if (!Number.isFinite(angles[i])) continue;
    const [pi, pa] = fixed[fixed.length - 1];
    const a = pa + (((angles[i] - pa) % 360) + 360) % 360;
    if (a - pa >= (i - pi) && limit - a >= (K - i)) fixed.push([i, a]);
  }
  fixed.push([K, limit]);
  const out = new Array(K + 1);
  for (let f = 0; f < fixed.length - 1; f++) {
    const [i0, a0] = fixed[f], [i1, a1] = fixed[f + 1];
    for (let i = i0; i < i1; i++) out[i] = a0 + (a1 - a0) * (i - i0) / (i1 - i0);
  }
  out[K] = limit;
  return out;
}

/** Continuous wheel angle (degrees, any number of turns, counter-clockwise = next entry = negative) -> sol angle (degrees, unwrapped). */
export function solFromWheelAngle(angleDeg, anchors) {
  const K = anchors.length - 1, A = 360 / K;
  const p = -angleDeg / A, turns = Math.floor(p / K), f = p - turns * K;
  const i = Math.min(K - 1, Math.floor(f)), t = f - i;
  return 360 * turns + anchors[i] + t * (anchors[i + 1] - anchors[i]);
}

/** The anchor of entry i, normalised to 0..360. */
export const anchorOf = (anchors, i) => norm360(anchors[Math.max(0, Math.min(anchors.length - 2, i))]);

/** The sol angle equivalent to `target` that lies closest to `near` (so snapping to an anchor never spins the sun a whole day). */
export const nearestEquivalent = (target, near) => target + 360 * Math.round((near - target) / 360);
