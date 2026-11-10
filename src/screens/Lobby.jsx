import { useContext, useEffect, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import NameField from '../components/NameField.jsx';
import { Choice, GesturePicker, Toggle } from './Setup.jsx';
import { TrackerContext } from '../hand/useHandTracking.js';
import { PRESETS, loadCustomGestures } from '../hand/gestures.js';
import { PLAYERS } from '../lib/players.js';
import { unlockAudio } from '../lib/sound.js';
import { candidateSeeds } from '../online/bodies.js';
import { MAX_PLAYERS } from '../online/room.js';
import { useRoomSnapshot } from '../online/useRoom.js';

const allGestures = () => [...PRESETS, ...loadCustomGestures()];

function Seat({ index, peer, snap, myStream }) {
  const color = PLAYERS[index];
  if (!peer) {
    return (
      <div className="seat empty" style={{ '--c': color.color }}>
        <span className="seat-wait">⏳</span>
        <b>Seat {index + 1}</b>
        <small>Waiting for a player…</small>
      </div>
    );
  }
  const isMe = peer.id === snap.meId;
  const isHost = peer.id === snap.hostId;
  const gesture = allGestures().find((g) => g.id === peer.gesture);
  return (
    <div className={`seat ${peer.ready || isHost ? 'ready' : ''}`} style={{ '--c': color.color, '--d': color.dark }}>
      <Avatar body={peer.body} stream={isMe ? myStream : snap.streams[peer.id]} showCamera={peer.share} mirror={isMe} size={118} />
      <b className="seat-name">
        {isHost && '👑 '}
        {peer.name || 'Player'}
        {isMe && <em> (you)</em>}
      </b>
      <small>
        {gesture ? `${gesture.emoji} ${gesture.name}` : '🖐️'} · {isHost ? 'Host' : peer.ready ? '✔ Ready' : '… not ready'}
      </small>
    </div>
  );
}

export default function Lobby({ room, game, profile, onProfile, onLeave }) {
  const snap = useRoomSnapshot(room);
  const { stream } = useContext(TrackerContext);
  const [cands, setCands] = useState(() => candidateSeeds(7));
  const [copied, setCopied] = useState(false);

  const me = snap.peers.find((p) => p.id === snap.meId);
  const others = snap.peers.filter((p) => p.id !== snap.meId);
  const isHost = snap.isHost;
  const settings = snap.settings || {};
  const allReady = others.every((p) => p.ready);
  const spectating = snap.phase === 'playing';

  // keep presence in sync with what I picked
  useEffect(() => {
    room.setMe({ name: profile.name.trim() || 'Player', body: profile.body, gesture: profile.gesture, share: profile.share });
  }, [room, profile.name, profile.body, profile.gesture, profile.share]);

  const invite = `${window.location.origin}${window.location.pathname}?room=${snap.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this invite link:', invite);
    }
  };

  const setSetting = (key) => (value) => room.setSettings({ ...settings, [key]: value });
  const visibleSettings = game.settings.filter((f) => !f.showIf || f.showIf(settings));
  const label = (f, v) => f.options?.find((o) => o.value === v);

  const seats = Array.from({ length: MAX_PLAYERS }, (_, i) => snap.peers[i] || null);

  return (
    <main className="page lobby-page">
      <header className="page-head">
        <button className="btn btn-small" onClick={onLeave}>
          ← Leave
        </button>
        <h1>
          {game.emoji} {game.name} lobby
        </h1>
      </header>

      <section className="card room-code-card" style={{ '--c': '#FFC83D' }}>
        <div className="room-code-wrap">
          <span className="room-code-label">Room code</span>
          <span className="room-code">{snap.code}</span>
        </div>
        <button className="btn btn-honey" onClick={copy}>
          {copied ? '✔ Link copied!' : '🔗 Copy invite link'}
        </button>
        <p className="note">Friends open the link, or type the code under “Play online → Join”.</p>
      </section>

      {spectating && <p className="banner">🍉 A round is in progress – you’ll hop in on the next one!</p>}

      <div className="seats">
        {seats.map((p, i) => (
          <Seat key={p?.id || `empty-${i}`} index={i} peer={p} snap={snap} myStream={stream} />
        ))}
      </div>

      <div className="lobby-grid">
        <section className="card" style={{ '--c': '#FF7A59' }}>
          <h2>🧍 Your look</h2>
          <NameField value={profile.name} onChange={(v) => onProfile({ name: v })} placeholder="Your name" label="Your name" />

          <h3>Pick a body (your camera is the head!)</h3>
          <div className="body-grid">
            {[profile.body, ...cands.filter((s) => s !== profile.body)].slice(0, 8).map((seed) => (
              <button
                key={seed}
                className={`body-option ${seed === profile.body ? 'on' : ''}`}
                onClick={() => onProfile({ body: seed })}
                aria-pressed={seed === profile.body}
                aria-label="Choose this body"
              >
                <Avatar body={seed} stream={null} size={62} />
              </button>
            ))}
          </div>
          <button className="btn btn-small" onClick={() => setCands(candidateSeeds(7))}>
            🎲 Shuffle new bodies
          </button>

          <Toggle
            label="Camera as my head"
            hint="Off = an emoji face instead of your video"
            emoji="📷"
            value={profile.share}
            onChange={(v) => onProfile({ share: v })}
          />
        </section>

        <section className="card" style={{ '--c': '#6C8CFF' }}>
          <h2>🖐️ Your gesture</h2>
          <p className="note">Everyone picks their own way to slice.</p>
          <GesturePicker value={profile.gesture} onChange={(g) => onProfile({ gesture: g })} canRecord={false} />
        </section>

        <section className="card" style={{ '--c': '#4FC48A' }}>
          <h2>🎛️ Room rules {isHost ? '' : <small className="host-note">(host decides)</small>}</h2>
          {isHost
            ? visibleSettings.map((f) =>
                f.type === 'choice' ? (
                  <div className="field" key={f.key}>
                    <h3>{f.label}</h3>
                    <Choice options={f.options} value={settings[f.key]} onChange={setSetting(f.key)} />
                  </div>
                ) : (
                  <Toggle key={f.key} label={f.label} hint={f.hint} emoji={f.emoji} value={!!settings[f.key]} onChange={setSetting(f.key)} />
                ),
              )
            : (
              <div className="rule-pills">
                {visibleSettings.map((f) => {
                  const v = settings[f.key];
                  if (f.type === 'choice') {
                    const o = label(f, v);
                    return (
                      <span key={f.key} className="pill">
                        {f.label}: {o?.emoji} {o?.label || String(v)}
                      </span>
                    );
                  }
                  return (
                    <span key={f.key} className="pill">
                      {f.emoji} {f.label}: {v ? 'on' : 'off'}
                    </span>
                  );
                })}
              </div>
            )}
        </section>
      </div>

      <div className="start-bar">
        {isHost ? (
          <button
            className="btn btn-huge btn-honey"
            disabled={!allReady || spectating}
            onClick={() => {
              unlockAudio();
              room.startGame();
            }}
          >
            {allReady ? `▶ Start for ${snap.peers.length} player${snap.peers.length > 1 ? 's' : ''}` : `⏳ Waiting for ${others.filter((p) => !p.ready).length} to be ready`}
          </button>
        ) : (
          <button
            className={`btn btn-huge ${me?.ready ? '' : 'btn-honey'}`}
            onClick={() => {
              unlockAudio();
              room.setMe({ ready: !me?.ready });
            }}
          >
            {me?.ready ? '✔ Ready! (tap to undo)' : '👍 I’m ready'}
          </button>
        )}
      </div>
    </main>
  );
}
