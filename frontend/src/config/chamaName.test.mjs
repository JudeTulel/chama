import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChamaName } from './chamaNameCore.ts';

test('trims a supplied chama name', () => {
  assert.equal(normalizeChamaName('  Nairobi Savers  '), 'Nairobi Savers');
});

test('rejects a blank chama name', () => {
  assert.throws(() => normalizeChamaName('   '), /enter a name/i);
});

test('rejects names longer than 64 characters', () => {
  assert.throws(() => normalizeChamaName('x'.repeat(65)), /64 UTF-8 bytes/i);
});

test('rejects names exceeding the contract UTF-8 byte limit', () => {
  assert.throws(() => normalizeChamaName('😀'.repeat(17)), /64 UTF-8 bytes/i);
});
