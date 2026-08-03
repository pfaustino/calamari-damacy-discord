/**
 * Pure ball–ball collision helpers (host-authoritative multiplayer).
 * Impulse along contact normal n (A → B); Δv = J / m per body.
 */

/** @typedef {{ melt: number, propId: number }} ScatterCandidate */

/**
 * Closing-speed impulse magnitude (scalar J along normal).
 * @param {number} velAlong (vA - vB) · n; resolve only when > 0
 * @param {number} mA
 * @param {number} mB
 * @param {number} [restitution=0.55]
 */
export function computeImpulseMagnitude(velAlong, mA, mB, restitution = 0.55) {
  if (velAlong <= 0) return 0;
  const inv = 1 / mA + 1 / mB;
  return ((1 + restitution) * velAlong) / inv;
}

/** Speed change a body experiences from impulse J. */
export function computeDeltaV(jImp, mass) {
  if (jImp <= 0 || mass <= 0) return 0;
  return jImp / mass;
}

/**
 * How many stuck props to shed from one ball.
 * @param {number} eligibleCount
 * @param {number} deltaV
 * @param {{ scatterVRef?: number, maxScatterFrac?: number, minScatterFrac?: number, scatterDeltaVMin?: number }} [tuning]
 */
export function computeScatterCount(eligibleCount, deltaV, tuning = {}) {
  const {
    scatterVRef = 5,
    maxScatterFrac = 0.65,
    minScatterFrac = 0.08,
    scatterDeltaVMin = 1,
  } = tuning;

  if (eligibleCount <= 0 || deltaV < scatterDeltaVMin) return 0;

  const frac = Math.min(maxScatterFrac, Math.max(0, deltaV / scatterVRef));
  let count = Math.floor(eligibleCount * frac);
  if (frac >= minScatterFrac && count < 1) count = 1;
  return Math.min(count, eligibleCount);
}

/**
 * Deterministic shed order: loosest (low melt) first, then lowest propId.
 * @param {ScatterCandidate[]} candidates
 * @param {number} count
 * @returns {number[]} indices into the original stuck array
 */
export function pickScatterIndices(candidates, count) {
  if (count <= 0 || candidates.length === 0) return [];

  const ranked = candidates
    .map((s, index) => ({ index, melt: s.melt, propId: s.propId }))
    .sort((a, b) => a.melt - b.melt || a.propId - b.propId);

  return ranked.slice(0, count).map((r) => r.index);
}

/** Stable spread angle in radians from propId (no RNG). */
export function scatterSpreadAngle(propId) {
  return ((propId * 0.6180339887) % 1 - 0.5) * Math.PI * 0.95;
}

/**
 * Impulse-scaled volume steal (proportional units).
 * @param {number} lighterVolume
 * @param {number} heavierVolume
 * @param {number} deltaVLighter
 * @param {{ stealDeltaVMin?: number, stealVolumeCap?: number }} [tuning]
 */
export function computeStealVolume(lighterVolume, heavierVolume, deltaVLighter, tuning = {}) {
  const { stealDeltaVMin = 1.8, stealVolumeCap = 0.35 } = tuning;
  if (deltaVLighter < stealDeltaVMin || lighterVolume <= 0) return 0;

  const scale = 0.02 + 0.06 * (deltaVLighter / stealDeltaVMin);
  return Math.min(
    lighterVolume * scale,
    heavierVolume * 0.04,
    stealVolumeCap,
  );
}
