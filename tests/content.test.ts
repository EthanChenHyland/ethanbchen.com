import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedProgress, isKey, schemaLabels } from '../src/content.ts';

test('schema lookup rejects inherited and arbitrary keys', () => {
  assert.equal(isKey('present', schemaLabels), true);
  assert.equal(isKey('toString', schemaLabels), false);
  assert.equal(isKey('__proto__', schemaLabels), false);
  assert.equal(isKey(undefined, schemaLabels), false);
});
test('playback and scroll progress stays bounded at track edges', () => {
  assert.equal(boundedProgress(-1, 0, 12.3), 0);
  assert.equal(boundedProgress(20, 0, 12.3), 1);
  assert.equal(boundedProgress(6.15, 0, 12.3), .5);
  assert.equal(boundedProgress(NaN, 0, 12.3), 0);
  assert.equal(boundedProgress(1, 2, 2), 0);
});
