// Invite plumbing: an offer or answer squeezed into something a person can send.
// WebRTC needs both halves of the handshake and there is no signaling server, so the
// invite travels as a link and the reply still has to come back by hand.

export const MAX_CODE = 24000;
const toBase64Url = (bytes: Uint8Array) => { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromBase64Url = (text: string) => { const padded = text.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), c => c.charCodeAt(0)); };
// Deflate keeps a full SDP inside a link short enough for a messenger to leave alone.
async function deflate(text: string) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes: Uint8Array) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

// Accepts a bare code or a whole invite link, because people paste either one.
export function readCode(text: string): string {
  const trimmed = text.trim();
  const fromLink = /[#?&]j=([A-Za-z0-9\-_.+/=]+)/.exec(trimmed);
  return (fromLink ? fromLink[1] : trimmed).replace(/\s/g, '');
}

// The code rides in the fragment, which browsers never send to the server.
export function joinLink(code: string, base = location.href): string {
  const url = new URL(base);
  url.search = '';
  url.hash = 'j=' + code;
  return url.href;
}

export async function encodeInvite(description: RTCSessionDescription | RTCSessionDescriptionInit | null): Promise<string> {
  const text = JSON.stringify({ type: description?.type, sdp: description?.sdp });
  const squeezed = await deflate(text);
  return squeezed ? 'LU2.' + toBase64Url(squeezed) : 'LU1.' + toBase64Url(new TextEncoder().encode(text));
}

export async function decodeInvite(code: string, type: 'offer' | 'answer'): Promise<RTCSessionDescriptionInit> {
  const clean = readCode(code);
  if (!/^LU[12]\./.test(clean) || clean.length > MAX_CODE) throw new Error('That doesn’t look like a Little Us invite. Paste the whole link or code.');
  let parsed;
  try {
    const bytes = fromBase64Url(clean.slice(4));
    parsed = JSON.parse(clean.startsWith('LU2.') ? await inflate(bytes) : new TextDecoder().decode(bytes));
  } catch { throw new Error('That invite looks incomplete. Copy the whole thing and paste it again.'); }
  if (parsed.type !== type || typeof parsed.sdp !== 'string') throw new Error(type === 'offer' ? 'That looks like a reply code, not an invite.' : 'Expected your partner’s reply code.');
  return { type, sdp: parsed.sdp };
}
