import test from 'node:test';
import assert from 'node:assert/strict';
import { FINDINGS, SAMPLE_KEY, SAMPLE_OUTPUTS, isLabel, isProjectId, pitchName, isBlackKey, progressBetween, scoreOutput } from '../src/content.ts';

test('only the four controlled labels are labels', () => {
  for (const label of ['present', 'absent', 'uncertain', 'not_reported']) assert.equal(isLabel(label), true);
  for (const other of ['intact', 'yes', 'Present', '', 'toString', '__proto__', undefined]) assert.equal(isLabel(other), false);
});

test('the scorer accepts exact labels and never translates clinical words', () => {
  const strict = scoreOutput(SAMPLE_OUTPUTS.strict, SAMPLE_KEY);
  assert.equal(strict.filter((r) => r.ok).length, 6);
  const loose = scoreOutput(SAMPLE_OUTPUTS.loose, SAMPLE_KEY);
  assert.equal(loose.filter((r) => r.ok).length, 0);
  assert.equal(loose.find((r) => r.field === 'mcl_injury')?.reason, 'not a controlled label');
  // "absent" is a label, but silence is not a negative finding: not_reported was expected
  assert.equal(loose.find((r) => r.field === 'osteoarthritis')?.reason, 'expected not_reported');
});

test('missing and inherited fields are misses, in schema order', () => {
  const results = scoreOutput({ acl_tear: 'present' }, SAMPLE_KEY);
  assert.deepEqual(results.map((r) => r.field), [...FINDINGS]);
  assert.equal(results[1].reason, 'missing field');
  const proto = scoreOutput(Object.create({ fracture: 'absent' }), SAMPLE_KEY);
  assert.equal(proto.find((r) => r.field === 'fracture')?.ok, false);
});

test('progress stays bounded', () => {
  assert.equal(progressBetween(-1, 0, 10), 0);
  assert.equal(progressBetween(20, 0, 10), 1);
  assert.equal(progressBetween(5, 0, 10), 0.5);
  assert.equal(progressBetween(NaN, 0, 10), 0);
  assert.equal(progressBetween(1, 2, 2), 0);
});

test('pitch helpers', () => {
  assert.equal(pitchName(60), 'C4');
  assert.equal(pitchName(43), 'G2');
  assert.equal(isBlackKey(61), true);
  assert.equal(isBlackKey(64), false);
  assert.equal(isProjectId('city'), true);
  assert.equal(isProjectId('frog'), false);
});
