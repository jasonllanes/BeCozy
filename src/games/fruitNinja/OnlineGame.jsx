import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '../../components/Avatar.jsx';
import { TrackerContext } from '../../hand/useHandTracking.js';
import { getGesture, readPointers } from '../../hand/gestures.js';
import { computeZones } from '../../lib/zones.js';
import { PLAYERS } from '../../lib/players.js';
import { setSoundEnabled, sfx, unlockAudio } from '../../lib/sound.js';
import { FruitNinjaEngine, MAX_HP } from './engine.js';
import { useRoomSnapshot } from '../../online/useRoom.js';
import Summary from './Summary.jsx';

const DEFAULTS = { mode: 'classic', difficulty: 'normal', duration: 60, bombs: true, powerups: true, trail: true };

/** Live scoreboard: everyone's avatar (camera head), score, hearts and boosts. */
function Roster({ snap, mySnap, myStream, survival }) {
  const round = snap.round;
  return (
    <aside className="roster" aria-label="Scoreboard">
      {round.players.map((pid, i) => {
        const isMe = pid === snap.meId;
        const peer = snap.peers.find((p) => p.id === pid);
        const known = snap.known[pid];
        const s = isMe ? mySnap : snap.roster[pid] || { score: 0, hp: MAX_HP };
        const P = PLAYERS[i];
        return (
          <div key={pid} className={`roster-row ${isMe ? 'me' : ''} ${peer ? '' : 'gone'}`} style={{ '--c': P.color }}>
            <Avatar
              body={(peer || known)?.body}
              stream={isMe ? myStream : snap.streams[pid]}
              showCamera={peer ? peer.share : false}
              mirror={isMe}
              size={46}
            />
            <div className="roster-info">
              <span className="roster-name">{(peer || known)?.name || 'Player'}</span>
              <span className="roster-score">{s.score}</span>
              <span className="roster-flags">
                {survival && (s.dead ? '💀' : Array.from({ length: MAX_HP }, (_, k) => (k < s.hp ? '❤️' : '🖤')).join(''))}
                {s.mult > 1 && ` ⭐x${s.mult}`}
                {s.slow && ' ❄️'}
                {!peer && ' (left)'}
              </span>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

export default function OnlineGame({ room, profile, onLeave, onBusy }) {
  const snap = useRoomSnapshot(room);
  const { videoRef, status, error, detect, retry, stream } = useContext(TrackerContext);
  const round = snap.round;
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const finalRef = useRef(null);
  const [phase, setPhase] = useState('lobby');
  const [mySnap, setMySnap] = useState({ score: 0, hp: MAX_HP, dead: false, mult: 1, slow: false });
  const [myFinal, setMyFinal] = useState(null);

  const settings = useMemo(() => ({ ...DEFAULTS, ...round.settings, players: 1, layout: 'columns', sound: true }), [round]);
  const seat = round.players.indexOf(snap.meId);
  const gesture = useMemo(() => getGesture(profile.gesture), [profile.gesture]);
  const identity = useMemo(() => ({ ...PLAYERS[seat], name: (profile.name || 'Player').slice(0, 16) }), [seat, profile.name]);
  const survival = settings.mode === 'survival';

  useEffect(() => {
    setSoundEnabled(true);
    unlockAudio();
  }, []);

  // hands drive the board only while the round is running
  useEffect(() => {
    onBusy?.(phase === 'countdown' || phase === 'playing');
  }, [phase, onBusy]);
  useEffect(() => () => onBusy?.(false), [onBusy]);

  // main loop: track → update my board → draw → share my live state
  useEffect(() => {
    const engine = new FruitNinjaEngine({
      players: 1,
      settings,
      gesture,
      seed: round.seed, // same seed for everyone => same fruit sequence
      identities: [identity],
      onSound: (name) => sfx[name]?.(),
    });
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let W = 0;
    let H = 0;
    let raf = 0;
    let last = performance.now();
    let shownPhase = 'lobby';
    let lastKey = '';
    let lastSend = 0;
    let zones = [];

    const resize = () => {
      W = stage.clientWidth;
      H = stage.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      zones = computeZones(1, 'columns', W, H);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - last) / 1000;
      last = now;
      const video = videoRef.current;

      if (status === 'ready' && engine.phase === 'lobby') engine.begin(); // everyone starts together

      let input = null;
      if (status === 'ready' && video?.videoWidth) {
        const view = { W, H, vw: video.videoWidth, vh: video.videoHeight };
        const found = readPointers(gesture, detect(), view).filter((p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H);
        input = found.find((p) => p.active) || found[0] || null;
      }
      engine.update(dt, zones, [input]);
      engine.draw(ctx, zones, W, H);

      if (engine.phase !== shownPhase) {
        shownPhase = engine.phase;
        setPhase(shownPhase);
      }

      // share my live state ≤4×/s (and a 1 s heartbeat that also re-sends my final result)
      const s = engine.snapshot();
      const key = JSON.stringify(s);
      if ((key !== lastKey && now - lastSend > 250) || now - lastSend > 1000) {
        lastKey = key;
        lastSend = now;
        setMySnap(s);
        room.sendRoster(s, finalRef.current);
      }

      if (engine.phase === 'done' && engine.phaseTime > 2.2 && !finalRef.current) {
        const f = { ...engine.summary()[0], playTime: engine.playTime };
        finalRef.current = f;
        room.sendFinal(f);
        setMyFinal(f);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [status, detect, videoRef, settings, gesture, identity, round, room]);

  // ---- who is still playing / who has finished -----------------------------
  const present = new Set(snap.peers.map((p) => p.id));
  const pending = round.players.filter((pid) => !snap.finals[pid] && present.has(pid));
  const allDone = !!myFinal && pending.length === 0;

  const results = round.players.map((pid, i) => {
    const f = snap.finals[pid];
    if (f) return f;
    // left mid-round: keep their last known score
    const k = snap.known[pid];
    return {
      ...PLAYERS[i],
      name: `${k?.name || 'Player'} (left)`,
      score: snap.roster[pid]?.score || 0,
      sliced: snap.roster[pid]?.sliced || 0,
      missed: 0,
      accuracy: 0,
      bombs: 0,
      bestCombo: 0,
      powerups: 0,
      maxMult: 1,
      hp: 0,
      dead: false,
      survived: 0,
      topFruit: null,
    };
  });

  const leave = () => {
    if (window.confirm('Leave the room? Your round will end.')) onLeave();
  };

  return (
    <div ref={stageRef} className="stage">
      <canvas ref={canvasRef} className="game-canvas" />
      <Roster snap={snap} mySnap={mySnap} myStream={stream} survival={survival} />

      <button className="btn btn-small stage-exit" onClick={leave}>
        ✕ Leave
      </button>

      {status !== 'ready' && status !== 'error' && (
        <div className="overlay">
          <div className="panel center">
            <div className="spin">🍉</div>
            <h2>Getting your tracking ready…</h2>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="overlay">
          <div className="panel center">
            <div className="big-emoji">📷</div>
            <h2>Camera trouble</h2>
            <p>{error}</p>
            <button className="btn btn-honey" onClick={retry}>
              Try again
            </button>
          </div>
        </div>
      )}

      {myFinal && !allDone && (
        <div className="lobby">
          <div className="panel lobby-panel center">
            <h2>🏁 You finished with {myFinal.score}!</h2>
            <p>
              Waiting for{' '}
              {pending.map((pid) => snap.known[pid]?.name || 'a player').join(', ')}…
            </p>
          </div>
        </div>
      )}

      {allDone && (
        <Summary
          data={{ players: results, playTime: myFinal.playTime, best: null }}
          settings={settings}
          gesture={gesture}
          meIndex={seat}
          prefill={profile.name.trim()}
          actions={
            <>
              {snap.isHost ? (
                <button className="btn btn-big btn-honey" onClick={() => room.backToLobby()}>
                  ↻ Back to lobby
                </button>
              ) : (
                <p className="note">Waiting for the host to start another round…</p>
              )}
              <button className="btn" onClick={onLeave}>
                🚪 Leave room
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
