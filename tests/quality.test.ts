import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameBudget, pickTier, type DeviceSignals } from '../src/quality.ts';

const base: DeviceSignals = { reducedMotion: false, coarsePointer: false, dpr: 2, cores: 10, memory: 16, shortSide: 900, override: null };

test('tiers follow capability, not width alone', () => {
  assert.equal(pickTier(base), 'high');
  assert.equal(pickTier({ ...base, cores: 6 }), 'standard');
  assert.equal(pickTier({ ...base, cores: 4 }), 'low');
  // a large phone with a strong chip still gets the standard tier
  assert.equal(pickTier({ ...base, coarsePointer: true, shortSide: 430, cores: 6, memory: 8 }), 'standard');
  assert.equal(pickTier({ ...base, coarsePointer: true, shortSide: 375, cores: 6 }), 'low');
  assert.equal(pickTier({ ...base, reducedMotion: true }), 'static');
  assert.equal(pickTier({ ...base, reducedMotion: true, override: 'high' }), 'high');
  assert.equal(pickTier({ ...base, override: 'nonsense' }), 'high');
});

test('frame budget lowers pixel ratio first, then effects', () => {
  const budget = new FrameBudget();
  const verdicts: (string | null)[] = [];
  // 3 s of 30 fps frames
  for (let k = 0; k < 600; k++) {
    const v = budget.sample(1 / 30, false);
    if (v) verdicts.push(v);
  }
  assert.deepEqual(verdicts.slice(0, 3), ['dpr', 'dpr', 'tier']);
});

test('frame budget ignores hitches and hidden tabs', () => {
  const budget = new FrameBudget();
  for (let k = 0; k < 600; k++) assert.equal(budget.sample(k % 2 ? 0.5 : 1 / 30, k % 3 === 0), null);
});
