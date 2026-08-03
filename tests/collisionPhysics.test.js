import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeImpulseMagnitude,
  computeDeltaV,
  computeScatterCount,
  pickScatterIndices,
  computeStealVolume,
} from '../src/game/collisionPhysics.js';

describe('computeImpulseMagnitude', () => {
  it('returns 0 when bodies are separating', () => {
    assert.equal(computeImpulseMagnitude(0, 2, 0.6), 0);
    assert.equal(computeImpulseMagnitude(-1, 2, 0.6), 0);
  });

  it('conserves momentum along normal for equal masses', () => {
    const m = 2;
    const velAlong = 4;
    const e = 0.55;
    const j = computeImpulseMagnitude(velAlong, m, m, e);
    const dv = computeDeltaV(j, m);
    // Equal masses → each gets half the relative closing speed × (1+e)
    assert.ok(Math.abs(dv - (1 + e) * velAlong * 0.5) < 1e-9);
  });

  it('gives lighter body a larger delta-v', () => {
    const j = computeImpulseMagnitude(4, 2, 0.6, 0.55);
    const dvHeavy = computeDeltaV(j, 2);
    const dvLight = computeDeltaV(j, 0.6);
    assert.ok(dvLight > dvHeavy);
    // J is shared; m_light * dv_light contribution equals m_heavy * dv_heavy
    assert.ok(Math.abs(2 * dvHeavy - 0.6 * dvLight) < 1e-9);
  });
});

describe('computeScatterCount', () => {
  const tuning = { scatterVRef: 5, maxScatterFrac: 0.65, minScatterFrac: 0.08 };

  it('sheds more cargo for higher delta-v', () => {
    const heavy = computeScatterCount(10, 1.4, tuning);
    const light = computeScatterCount(10, 4.8, tuning);
    assert.ok(light > heavy);
    assert.equal(heavy, 2); // floor(10 * 1.4/5) = 2
    assert.equal(light, 6); // floor(10 * 0.65) capped = 6
  });

  it('returns 0 below minimum delta-v', () => {
    assert.equal(computeScatterCount(10, 0.5, tuning), 0);
  });

  it('sheds at least one when above minScatterFrac', () => {
    assert.equal(computeScatterCount(5, 1.2, tuning), 1);
  });
});

describe('pickScatterIndices', () => {
  it('is deterministic and prefers low melt', () => {
    const stuck = [
      { melt: 0.4, propId: 10 },
      { melt: 0.1, propId: 5 },
      { melt: 0.2, propId: 3 },
      { melt: 0.45, propId: 1 },
    ];
    const a = pickScatterIndices(stuck, 2);
    const b = pickScatterIndices(stuck, 2);
    assert.deepEqual(a, b);
    assert.deepEqual(a, [1, 2]); // melt 0.1 @5, then 0.2 @3
  });
});

describe('computeStealVolume', () => {
  it('scales with delta-v on the lighter ball', () => {
    const low = computeStealVolume(2, 5, 2.0);
    const high = computeStealVolume(2, 5, 5);
    assert.ok(high > low);
    assert.equal(computeStealVolume(2, 5, 1.0), 0);
  });
});
