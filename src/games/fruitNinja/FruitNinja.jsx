import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TrackerContext } from '../../hand/useHandTracking.js';
import { getGesture, readPointers } from '../../hand/gestures.js';
import { computeZones } from '../../lib/zones.js';
import { setSoundEnabled, sfx, unlockAudio } from '../../lib/sound.js';
import { FruitNinjaEngine } from './engine.js';
import Summary from './Summary.jsx';

const bestKey = (s) => `becozy.best.fruit-ninja.${s.mode}.${s.difficulty}${s.mode === 'classic' ? `.${s.duration}` : ''}`;

function recordBest(settings, score) {
  try {
    const prev = Number(localStorage.getItem(bestKey(settings)) || 0);
    if (score > prev) localStorage.setItem(bestKey(settings), String(score));
    return { prev, isNew: score > prev && score > 0 };
  } catch {
    return { prev: 0, isNew: false };
  }
}

export default function FruitNinja({ settings, onExit, onSettings, onBusy }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const zonesRef = useRef([]);
  const gesture = useMemo(() => getGesture(settings.gesture), [settings.gesture]);
  const { videoRef, status, error, detect, retry } = useContext(TrackerContext);
  const [phase, setPhase] = useState('lobby'); // lobby | countdown | playing | done | results
  const [summary, setSummary] = useState(null);

  const newEngine = useCallback(
    () =>
      new FruitNinjaEngine({
        players: settings.players,
        settings,
        gesture,
        onSound: (name) => sfx[name]?.(),
      }),
    [settings, gesture],
  );

  useEffect(() => {
    setSoundEnabled(settings.sound);
  }, [settings.sound]);

  // main loop: track → update engine → draw
  useEffect(() => {
    engineRef.current = newEngine();
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let W = 0;
    let H = 0;
    let raf = 0;
    let last = performance.now();
    let shownPhase = 'lobby';
    let summaryShown = false;

    const resize = () => {
      W = stage.clientWidth;
      H = stage.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      zonesRef.current = computeZones(settings.players, settings.layout, W, H);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - last) / 1000;
      last = now;
      const engine = engineRef.current;
      const zones = zonesRef.current;
      const video = videoRef.current;

      // pointers → one per zone (prefer one that is performing the gesture)
      const inputs = zones.map(() => null);
      if (status === 'ready' && video?.videoWidth) {
        const view = { W, H, vw: video.videoWidth, vh: video.videoHeight };
        const found = readPointers(gesture, detect(), view).filter((p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H);
        zones.forEach((zn, i) => {
          const inZone = found.filter((p) => p.x >= zn.x && p.x < zn.x + zn.w && p.y >= zn.y && p.y < zn.y + zn.h);
          inputs[i] = inZone.find((p) => p.active) || inZone[0] || null;
        });
      }

      engine.update(dt, zones, inputs);
      engine.draw(ctx, zones, W, H);

      if (engine.phase !== shownPhase) {
        shownPhase = engine.phase;
        setPhase(shownPhase);
      }
      if (engine.phase !== 'done') summaryShown = false;
      if (engine.phase === 'done' && engine.phaseTime > 2.2 && !summaryShown) {
        summaryShown = true;
        const players = engine.summary();
        const best = settings.players === 1 ? recordBest(settings, players[0].score) : null;
        setSummary({ players, playTime: engine.playTime, best });
        setPhase('results');
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [status, detect, videoRef, newEngine, gesture, settings]);

  // hands drive the game mid-round; in the lobby / results they drive the menu cursor
  useEffect(() => {
    onBusy?.(phase === 'countdown' || phase === 'playing' || phase === 'done');
  }, [phase, onBusy]);
  useEffect(() => () => onBusy?.(false), [onBusy]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onExit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const start = () => {
    unlockAudio();
    engineRef.current.begin();
  };

  const playAgain = () => {
    unlockAudio();
    engineRef.current = newEngine();
    engineRef.current.begin();
    setSummary(null);
    setPhase('countdown');
  };

  const survival = settings.mode === 'survival';

  return (
    <div ref={stageRef} className={`stage ${settings.showCamera ? '' : 'stage-nocam'}`}>
      <canvas ref={canvasRef} className="game-canvas" />

      <button className="btn btn-small stage-exit" onClick={onExit}>
        ✕ Exit
      </button>

      {status === 'loading' && (
        <div className="overlay">
          <div className="panel center">
            <div className="spin">🍉</div>
            <h2>Warming up the kitchen…</h2>
            <p>Allow camera access when your browser asks. Your video never leaves this device.</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="overlay">
          <div className="panel center">
            <div className="big-emoji">📷</div>
            <h2>Camera trouble</h2>
            <p>{error}</p>
            <div className="row">
              <button className="btn btn-honey" onClick={retry}>
                Try again
              </button>
              <button className="btn" onClick={onExit}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'ready' && phase === 'lobby' && (
        <div className="lobby">
          <div className="panel lobby-panel">
            <h2>Ready to slice? {gesture.emoji}</h2>
            <div className="row tags">
              <span className="pill">{survival ? '❤️ Survival · 3 lives' : `⏱ Classic · ${settings.duration}s`}</span>
              <span className="pill">
                {gesture.emoji} {gesture.name}
              </span>
              {settings.powerups && <span className="pill">⭐ Power-ups</span>}
            </div>
            <p>
              {gesture.how} {survival ? 'Hit 3 bombs 💣 and you’re out!' : 'Dodge the bombs 💣!'}
              {settings.powerups && ' Slice glowing ⭐ 🔥 ❄️ items for boosts.'}
            </p>
            <div className="row">
              <button className="btn btn-big btn-honey" onClick={start}>
                ▶ Start round
              </button>
              <button className="btn" onClick={onSettings}>
                ⚙ Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'results' && summary && (
        <Summary
          data={summary}
          settings={settings}
          gesture={gesture}
          onAgain={playAgain}
          onSettings={onSettings}
          onExit={onExit}
        />
      )}
    </div>
  );
}
