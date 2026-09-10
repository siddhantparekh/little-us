// Manual signaling: users exchange an offer and answer through their own messenger.
// Only a public STUN lookup is used. There is deliberately no signaling or TURN backend.
import { encodeInvite, decodeInvite } from './invite';

export class PeerSession {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(public host: boolean, private onData: (data: unknown) => void, private onStatus: (status: string) => void) {
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(this.pc.connectionState)) this.onStatus('disconnected');
    };
    if (host) this.bind(this.pc.createDataChannel('little-us', { ordered: true }));
    else this.pc.ondatachannel = e => this.bind(e.channel);
  }
  private bind(channel: RTCDataChannel) {
    this.channel = channel;
    channel.onopen = () => { clearTimeout(this.timer); this.onStatus('connected'); };
    channel.onclose = () => this.onStatus('disconnected');
    channel.onerror = () => this.onStatus('disconnected');
    channel.onmessage = event => {
      if (typeof event.data !== 'string' || event.data.length > 32000) return;
      try { this.onData(JSON.parse(event.data)); } catch { /* Ignore invalid peer messages. */ }
    };
  }
  send(data: unknown) { if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(data)); }
  private async code() {
    await new Promise<void>((resolve, reject) => {
      if (this.pc.iceGatheringState === 'complete') return resolve();
      const timeout = setTimeout(() => { this.pc.removeEventListener('icegatheringstatechange', check); reject(new Error('Connection details took too long. Try again on another network.')); }, 15000);
      const check = () => { if (this.pc.iceGatheringState === 'complete') { clearTimeout(timeout); this.pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
      this.pc.addEventListener('icegatheringstatechange', check);
    });
    return encodeInvite(this.pc.localDescription);
  }
  private waitForConnection() { this.timer = setTimeout(() => { if (this.channel?.readyState !== 'open') this.onStatus('timeout'); }, 120000); }
  async offer() { await this.pc.setLocalDescription(await this.pc.createOffer()); return this.code(); }
  async answer(code: string) { await this.pc.setRemoteDescription(await decodeInvite(code, 'offer')); await this.pc.setLocalDescription(await this.pc.createAnswer()); const answer = await this.code(); this.waitForConnection(); return answer; }
  async finish(code: string) { await this.pc.setRemoteDescription(await decodeInvite(code, 'answer')); this.waitForConnection(); }
  close() { clearTimeout(this.timer); this.pc.onconnectionstatechange = null; if (this.channel) { this.channel.onclose = null; this.channel.onerror = null; this.channel.onopen = null; } this.channel?.close(); this.pc.close(); }
}
