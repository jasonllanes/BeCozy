import { useContext, useEffect, useRef, useState } from 'react';
import { TrackerContext } from '../hand/useHandTracking.js';
import { buildTemplate, poseDistance, poseVector, toScreen } from '../hand/pointing.js';

const EMOJIS = ['🤟', '✌️', '🖐️', '👌', '🤙', '👍', '🤘', '🤞', '🫰', '🫶', '🤏', '🖖'];
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const RECORD_MS = 2500;
const MIN_SAMPLES = 20;

export default function GestureRecorder({ onCancel, onSave }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const { videoRef, status, error, detect, retry } = useContext(TrackerContext);

  const [step, setStepState] = useState('intro'); // intro | countdown | recording | review
  const [count, setCount] = useState(3);
  const [progress, setProgress] = useState(0);
  const [name, setName] = useState('My gesture');
  const [emoji, setEmoji] = useState('🤟');
  const [msg, setMsg] = useState('');
  const [handSeen, setHandSeen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [model, setModel] = useState(null);

  const stepRef = useRef('intro');
  const samples = useRef([]);
  const recStart = useRef(0);
  const modelRef = useRef(null);
  const timer = useRef(null);
  const setStep = (s) => {
    stepRef.current = s;
    setStepState(s);
  };

  useEffect(() => () => clearInterval(timer.current), []);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let W = 0;
    let H = 0;
    let raf = 0;
    let lastFrame = null;
    let seen = false;
    let matched = false;

    const resize = () => {
      W = stage.clientWidth;
      H = stage.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);
      const video = videoRef.current;
      if (status !== 'ready' || !video?.videoWidth) return;
      const res = detect();
      const hand = res.hands[0];
      const view = { W, H, vw: video.videoWidth, vh: video.videoHeight };
      const isNewFrame = res !== lastFrame;
      lastFrame = res;

      if (!!hand !== seen) {
        seen = !!hand;
        setHandSeen(seen);
      }

      if (hand) {
        const pts = hand.lm.map((p) => toScreen(p.x, p.y, view));
        const good = stepRef.current === 'review' && matched;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#3B2418';
        ctx.lineWidth = 12;
        BONES.forEach(([a, b]) => {
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        });
        ctx.strokeStyle = good ? '#4FC48A' : '#FFC83D';
        ctx.lineWidth = 6;
        BONES.forEach(([a, b]) => {
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        });
        pts.forEach((p) => {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#3B2418';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        if (stepRef.current === 'recording' && isNewFrame) {
          samples.current.push(poseVector(hand.lm, view.vw, view.vh, hand.flip));
        }
        if (stepRef.current === 'review' && modelRef.current) {
          const d = poseDistance(poseVector(hand.lm, view.vw, view.vh, hand.flip), modelRef.current.template);
          const m = d < modelRef.current.threshold;
          if (m !== matched) {
            matched = m;
            setMatching(m);
          }
        }
      } else if (matched) {
        matched = false;
        setMatching(false);
      }

      if (stepRef.current === 'recording') {
        const p = Math.min(1, (performance.now() - recStart.current) / RECORD_MS);
        setProgress(p);
        if (p >= 1) finish();
      }
    };

    const finish = () => {
      if (samples.current.length < MIN_SAMPLES) {
        setMsg('We lost sight of your hand. Keep it in view and try again.');
        setStep('intro');
        return;
      }
      const built = buildTemplate(samples.current);
      modelRef.current = built;
      setModel(built);
      setMsg('');
      setStep('review');
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [status, detect, videoRef]);

  const begin = () => {
    if (!handSeen) {
      setMsg('Show your hand to the camera first, then press Record.');
      return;
    }
    setMsg('');
    setStep('countdown');
    let n = 3;
    setCount(3);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(timer.current);
        samples.current = [];
        recStart.current = performance.now();
        setProgress(0);
        setStep('recording');
      } else setCount(n);
    }, 900);
  };

  const save = () =>
    onSave({
      id: `custom-${Date.now()}`,
      name: name.trim() || 'My gesture',
      emoji,
      template: model.template,
      threshold: model.threshold,
      anchor: model.anchor,
    });

  return (
    <div ref={stageRef} className="stage">
      <canvas ref={canvasRef} className="game-canvas" />
      <button className="btn btn-small stage-exit" onClick={onCancel}>
        ✕ Cancel
      </button>

      {status === 'loading' && (
        <div className="overlay">
          <div className="panel center">
            <div className="spin">🖐️</div>
            <h2>Waking up the camera…</h2>
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
              <button className="btn" onClick={onCancel}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'countdown' && (
        <div className="big-count" aria-live="polite">
          <span key={count}>{count}</span>
          <small>Hold your pose!</small>
        </div>
      )}

      {status === 'ready' && (
        <div className="lobby">
          <div className="panel lobby-panel">
            {step === 'intro' && (
              <>
                <h2>Record your own gesture</h2>
                <p>
                  Make any <b>hand pose</b> (peace sign, thumbs up, rock-on…), hold it steady in front of the camera, and we’ll learn it. It works
                  with either hand, at any angle.
                </p>
                <div className="rec-row">
                  <input
                    className="text-input"
                    value={name}
                    maxLength={16}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Gesture name"
                    placeholder="Name it…"
                  />
                </div>
                <div className="emoji-pick">
                  {EMOJIS.map((e) => (
                    <button key={e} className={emoji === e ? 'on' : ''} onClick={() => setEmoji(e)} aria-label={`Icon ${e}`}>
                      {e}
                    </button>
                  ))}
                </div>
                <p className={`status ${handSeen ? 'ok' : ''}`}>{handSeen ? '✔ I can see your hand' : '👀 Waiting for your hand…'}</p>
                {msg && <p className="warn">{msg}</p>}
                <div className="row">
                  <button className="btn btn-big btn-honey" onClick={begin}>
                    ● Record
                  </button>
                </div>
              </>
            )}

            {step === 'countdown' && (
              <>
                <h2>Get your pose ready…</h2>
                <p>Recording starts in a moment. Keep your hand fully in view.</p>
              </>
            )}

            {step === 'recording' && (
              <>
                <h2>Hold it… {emoji}</h2>
                <div className="bar">
                  <span style={{ width: `${progress * 100}%` }} />
                </div>
                <p>Wiggle it a tiny bit for a sturdier match.</p>
              </>
            )}

            {step === 'review' && model && (
              <>
                <h2>
                  {emoji} {name || 'My gesture'}
                </h2>
                <p className={`match ${matching ? 'yes' : ''}`}>
                  {matching ? '✔ Matching!' : '✖ Not matching – try your pose now'}
                </p>
                <p>Test it: make the pose (it should turn green), then try a different hand shape (it shouldn’t).</p>
                {model.spread > 0.25 && <p className="warn">Your hand moved a lot while recording – a steadier pose will track better.</p>}
                <div className="row">
                  <button className="btn btn-big btn-honey" onClick={save}>
                    ✔ Save gesture
                  </button>
                  <button className="btn" onClick={() => setStep('intro')}>
                    ↺ Re-record
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
