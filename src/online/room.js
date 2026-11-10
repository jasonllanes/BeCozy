import { getSupabase } from '../lib/leaderboard.js';

// ---------------------------------------------------------------------------
// Online room.
//   Supabase Realtime (broadcast + presence): room code, who is here, host settings,
//   game start, live scores and WebRTC signalling.
//   WebRTC (peer-to-peer mesh, max 4): only the camera video that becomes each avatar's head.
// If video can't connect (strict networks) the game still works – heads fall back to emoji faces.
// ---------------------------------------------------------------------------

export const MAX_PLAYERS = 4;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O
export const makeCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = (s) => (s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
if (import.meta.env.VITE_TURN_URL) {
  ICE.push({
    urls: import.meta.env.VITE_TURN_URL.split(','),
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  });
}

const fail = (code, message) => Object.assign(new Error(message), { code });
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

class Peer {
  constructor(room, id, initiator) {
    this.room = room;
    this.id = id;
    this.initiator = initiator;
    this.pendingIce = [];
    this.hasRemote = false;
    const pc = (this.pc = new RTCPeerConnection({ iceServers: ICE }));

    if (room.sendTrack) pc.addTrack(room.sendTrack, room.sendStream);
    pc.ontrack = (e) => room._setStream(id, e.streams[0] || new MediaStream([e.track]));
    pc.onicecandidate = (e) => e.candidate && room._signal(id, { type: 'ice', candidate: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this._limitBitrate();
      if (pc.connectionState === 'failed') pc.restartIce?.();
    };
    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          room._signal(id, { type: 'offer', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        } catch (e) {
          console.warn('offer failed', e);
        }
      };
    }
  }

  // heads are tiny: keep video light so 3 outgoing streams stay cheap
  _limitBitrate() {
    this.pc.getSenders().forEach((s) => {
      if (s.track?.kind !== 'video') return;
      try {
        const p = s.getParameters();
        if (!p.encodings?.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = 180_000;
        p.encodings[0].maxFramerate = 15;
        p.encodings[0].scaleResolutionDownBy = 4;
        s.setParameters(p).catch(() => {});
      } catch {
        /* optional optimisation */
      }
    });
  }

  async handle(msg) {
    const { pc } = this;
    try {
      if (msg.type === 'offer') {
        await pc.setRemoteDescription(msg.sdp);
        this.hasRemote = true;
        await this._flushIce();
        await pc.setLocalDescription(await pc.createAnswer());
        this.room._signal(this.id, { type: 'answer', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      } else if (msg.type === 'answer') {
        await pc.setRemoteDescription(msg.sdp);
        this.hasRemote = true;
        await this._flushIce();
      } else if (msg.type === 'ice') {
        if (this.hasRemote) await pc.addIceCandidate(msg.candidate).catch(() => {});
        else this.pendingIce.push(msg.candidate);
      }
    } catch (e) {
      console.warn('signal failed', e);
    }
  }

  async _flushIce() {
    const list = this.pendingIce.splice(0);
    for (const c of list) await this.pc.addIceCandidate(c).catch(() => {});
  }

  close() {
    this.pc.onicecandidate = this.pc.ontrack = this.pc.onnegotiationneeded = this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}

export class Room {
  /**
   * profile: { name, body, gesture, share }   localStream: the player's camera MediaStream
   */
  constructor({ code, isCreator, profile, localStream }) {
    this.code = code;
    this.isCreator = isCreator;
    this.id = newId();
    this.me = {
      id: this.id,
      name: profile.name,
      body: profile.body,
      gesture: profile.gesture,
      share: profile.share,
      ready: false,
      host: isCreator,
      joinedAt: Date.now(),
    };
    this.conns = new Map();
    this.known = {};
    this.listeners = new Set();
    this.synced = false;
    this.left = false;

    // a light clone of the camera track is what other players receive
    const vt = localStream?.getVideoTracks?.()[0];
    if (vt) {
      this.sendTrack = vt.clone();
      this.sendTrack.enabled = !!profile.share;
      this.sendStream = new MediaStream([this.sendTrack]);
    }

    this.state = {
      status: 'connecting',
      error: '',
      code,
      meId: this.id,
      hostId: isCreator ? this.id : null,
      isHost: isCreator,
      peers: [this.me],
      known: {},
      streams: {},
      settings: null,
      phase: 'lobby', // lobby | playing
      round: null, // { seed, players: [ids in seat order], settings }
      roster: {}, // id -> live snapshot
      finals: {}, // id -> final result
    };
  }

  // ---- store (useSyncExternalStore) -------------------------------------
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.state;

  _set(patch) {
    const hostId = patch.hostId !== undefined ? patch.hostId : this.state.hostId;
    this.state = { ...this.state, ...patch, hostId, isHost: hostId === this.id };
    this.listeners.forEach((f) => f());
  }

  // ---- connection ----------------------------------------------------------
  async connect() {
    const sb = await getSupabase();
    const ch = (this.channel = sb.channel(`becozy:${this.code}`, {
      config: { broadcast: { self: false }, presence: { key: this.id } },
    }));

    this._ready = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });

    ch.on('presence', { event: 'sync' }, () => this._onSync());
    ch.on('presence', { event: 'join' }, () => this._onJoin());
    ch.on('broadcast', { event: 'signal' }, ({ payload }) => this._onSignal(payload));
    ch.on('broadcast', { event: 'settings' }, ({ payload }) => this._set({ settings: payload.settings }));
    ch.on('broadcast', { event: 'state' }, ({ payload }) => this._onState(payload));
    ch.on('broadcast', { event: 'start' }, ({ payload }) => this._onStart(payload.round));
    ch.on('broadcast', { event: 'roster' }, ({ payload }) => this._onRoster(payload));
    ch.on('broadcast', { event: 'final' }, ({ payload }) => this._set({ finals: { ...this.state.finals, [payload.id]: payload.r } }));
    ch.on('broadcast', { event: 'lobby' }, () => this._toLobby());

    await new Promise((resolve, reject) => {
      let settled = false;
      ch.subscribe((status) => {
        if (settled) return;
        if (status === 'SUBSCRIBED') {
          settled = true;
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          settled = true;
          reject(fail('REALTIME', 'Could not reach the room server. Make sure Realtime is enabled for your Supabase project.'));
        }
      });
    });
    await ch.track(this.me);

    const timer = setTimeout(() => this._rejectReady(fail('TIMEOUT', 'The room server took too long to answer.')), 8000);
    try {
      await this._ready;
    } finally {
      clearTimeout(timer);
    }
    this._set({ status: 'lobby' });
  }

  _onSync() {
    const state = this.channel.presenceState();
    const list = Object.values(state)
      .map((arr) => arr[arr.length - 1])
      .filter(Boolean)
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
    list.forEach((p) => {
      this.known[p.id] = { name: p.name, body: p.body, gesture: p.gesture };
    });
    const host = list.find((p) => p.host) || list[0];

    // WebRTC mesh: connect to everyone present, drop whoever left
    list.forEach((p) => p.id !== this.id && this._ensurePeer(p.id));
    for (const id of [...this.conns.keys()]) {
      if (!list.some((p) => p.id === id)) this._dropPeer(id);
    }

    this._set({ peers: list, hostId: host ? host.id : null, known: { ...this.known } });

    if (!this.synced && list.some((p) => p.id === this.id)) {
      this.synced = true;
      const others = list.filter((p) => p.id !== this.id);
      if (this.isCreator && others.some((p) => p.host)) this._rejectReady(fail('COLLISION', 'That room code is taken, trying another…'));
      else if (!this.isCreator && others.length === 0) this._rejectReady(fail('NOT_FOUND', `No room found with code ${this.code}.`));
      else if (!this.isCreator && others.length >= MAX_PLAYERS) this._rejectReady(fail('FULL', 'That room is full (4 players max).'));
      else this._resolveReady();
    }
  }

  // the host brings newcomers up to date
  _onJoin() {
    if (!this.state.isHost || !this.synced) return;
    setTimeout(() => this._send('state', { settings: this.state.settings, phase: this.state.phase, round: this.state.round }), 250);
  }

  _onState({ settings, phase, round }) {
    this._set({ settings: settings || this.state.settings, phase: phase || 'lobby', round: round || null });
  }

  _onStart(round) {
    this._set({ phase: 'playing', round, settings: round.settings, roster: {}, finals: {} });
  }

  _onRoster({ id, s, final }) {
    const patch = { roster: { ...this.state.roster, [id]: s } };
    if (final) patch.finals = { ...this.state.finals, [id]: final };
    this._set(patch);
  }

  _toLobby() {
    this._set({ phase: 'lobby', round: null, roster: {}, finals: {} });
    this.setMe({ ready: false });
  }

  // ---- WebRTC plumbing -------------------------------------------------------
  _ensurePeer(id) {
    if (!this.conns.has(id)) this.conns.set(id, new Peer(this, id, this.id < id));
    return this.conns.get(id);
  }

  _dropPeer(id) {
    this.conns.get(id)?.close();
    this.conns.delete(id);
    const { [id]: _gone, ...rest } = this.state.streams;
    this._set({ streams: rest });
  }

  _setStream(id, stream) {
    this._set({ streams: { ...this.state.streams, [id]: stream } });
  }

  _signal(to, payload) {
    this._send('signal', { to, from: this.id, ...payload });
  }

  _onSignal(msg) {
    if (msg.to !== this.id) return;
    this._ensurePeer(msg.from).handle(msg);
  }

  _send(event, payload) {
    this.channel?.send({ type: 'broadcast', event, payload })?.catch?.(() => {});
  }

  // ---- public API ------------------------------------------------------------
  setMe(patch) {
    Object.assign(this.me, patch);
    if ('share' in patch && this.sendTrack) this.sendTrack.enabled = !!patch.share;
    this.channel?.track(this.me);
  }

  /** host only */
  setSettings(settings) {
    this._set({ settings });
    this._send('settings', { settings });
  }

  /** host only: everyone currently in the room plays, seats follow join order */
  startGame() {
    const round = {
      seed: 1 + Math.floor(Math.random() * 2147483000),
      players: this.state.peers.map((p) => p.id),
      settings: this.state.settings,
    };
    this._set({ phase: 'playing', round, roster: {}, finals: {} });
    this._send('start', { round });
  }

  sendRoster(s, final = null) {
    this._set({ roster: { ...this.state.roster, [this.id]: s } });
    this._send('roster', { id: this.id, s, final });
  }

  sendFinal(r) {
    this._set({ finals: { ...this.state.finals, [this.id]: r } });
    this._send('final', { id: this.id, r });
  }

  /** host only */
  backToLobby() {
    this._send('lobby', {});
    this._toLobby();
  }

  async leave() {
    if (this.left) return;
    this.left = true;
    this.conns.forEach((p) => p.close());
    this.conns.clear();
    this.sendTrack?.stop();
    try {
      await this.channel?.untrack();
      const sb = await getSupabase();
      await sb.removeChannel(this.channel);
    } catch {
      /* already gone */
    }
    this._set({ status: 'closed' });
  }
}
