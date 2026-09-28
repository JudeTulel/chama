import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWalletChamas } from './chamaDiscoveryCore.ts';

const wallet = '0x00000000000000000000000000000000000000AA';
const other = '0x00000000000000000000000000000000000000BB';
const entry = (chamaId, owner, isMember, active = true) => ({
  chamaId: BigInt(chamaId), owner, isMember, active,
  name: `Chama ${chamaId}`,
  registry: '0x0000000000000000000000000000000000000001',
});

test('returns creator and member chamas with the right roles', () => {
  const chamas = classifyWalletChamas(wallet, [
    entry(1, wallet.toLowerCase(), false),
    entry(2, other, true),
    entry(3, other, false),
  ]);
  assert.deepEqual(chamas.map(item => [item.chamaId, item.role]), [[1n, 'Owner'], [2n, 'Member']]);
});

test('excludes unrelated wallets while retaining owned inactive chamas', () => {
  assert.deepEqual(classifyWalletChamas(wallet, [
    entry(1, other, false), entry(2, wallet, false, false),
  ]).map(item => [item.chamaId, item.role]), [[2n, 'Owner']]);
});

test('labels a creator who is also a member as owner', () => {
  const chamas = classifyWalletChamas(wallet, [entry(1, wallet, true)]);
  assert.equal(chamas[0].role, 'Owner');
});
