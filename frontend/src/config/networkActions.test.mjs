import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureWalletNetwork } from './networkActions.ts';

test('switches a wallet to the configured chain and verifies the result', async () => {
  let chainId = 1;
  const wallet = {
    async getNetwork() { return chainId; },
    async switchNetwork(target) { chainId = Number(target); },
  };

  await ensureWalletNetwork(wallet, 5042002);

  assert.equal(chainId, 5042002);
});

test('does not switch when the wallet already uses the configured chain', async () => {
  let switches = 0;
  const wallet = {
    async getNetwork() { return 5042002; },
    async switchNetwork() { switches += 1; },
  };

  await ensureWalletNetwork(wallet, 5042002);

  assert.equal(switches, 0);
});

test('stops before transactions if the wallet refuses the network switch', async () => {
  const wallet = {
    async getNetwork() { return 1; },
    async switchNetwork() { throw new Error('User rejected network switch'); },
  };

  await assert.rejects(ensureWalletNetwork(wallet, 5042002), /User rejected network switch/);
});
