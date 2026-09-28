export function buildInviteShareLinks(inviteUrl: string) {
  const message = `Join my chama on Arc: ${inviteUrl}`;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    email: `mailto:?subject=${encodeURIComponent('Join my chama')}&body=${encodeURIComponent(message)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`,
  };
}
