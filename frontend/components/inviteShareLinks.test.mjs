import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInviteShareLinks } from './inviteShareLinks.ts';

test('builds encoded WhatsApp, email, and X share links for invite URL', () => {
  const invite = 'https://chama.example/join/CHAMA-A%26B';
  const links = buildInviteShareLinks(invite);
  const message = `Join my chama on Arc: ${invite}`;

  assert.equal(links.whatsapp, `https://wa.me/?text=${encodeURIComponent(message)}`);
  assert.equal(links.email, `mailto:?subject=${encodeURIComponent('Join my chama')}&body=${encodeURIComponent(message)}`);
  assert.equal(links.x, `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`);
});
