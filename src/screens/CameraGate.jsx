import { useContext, useEffect, useState } from 'react';
import { TrackerContext } from '../hand/useHandTracking.js';

export default function CameraGate({ onContinue }) {
  const { status, error, retry, detect } = useContext(TrackerContext);
  const [handSeen, setHandSeen] = useState(false);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    const id = setInterval(() => setHandSeen(detect().hands.length > 0), 200);
    return () => clearInterval(id);
  }, [status, detect]);

  return (
    <main className="home gate">
      <div className="logo small-logo" aria-label="BeCozy">
        {'BeCozy'.split('').map((c, i) => (
          <span key={i} style={{ '--i': i }}>
            {c}
          </span>
        ))}
      </div>

      <div className="panel center gate-panel">
        {status === 'loading' && (
          <>
            <div className="spin">📷</div>
            <h2>Starting your camera…</h2>
            <p>Your browser will ask for camera access – please say yes. Everything stays on this device.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="big-emoji">🙈</div>
            <h2>We need your camera</h2>
            <p>{error}</p>
            <p>BeCozy is played with your hands, so the camera is required.</p>
            <button className="btn btn-big btn-honey" onClick={retry}>
              ↻ Try again
            </button>
          </>
        )}

        {status === 'ready' && (
          <>
            <div className="big-emoji">{handSeen ? '🙌' : '👋'}</div>
            <h2>{handSeen ? 'I can see your hand!' : 'Camera ready – show me a hand!'}</h2>
            <ul className="how">
              <li>
                <span>✋ ☝️</span> Move your open hand or pointing finger to steer the cursor
              </li>
              <li>
                <span>✊</span> Close your fist to select
              </li>
              <li>
                <span>☝️ …⏳</span> Or hold a pointing finger still on a button
              </li>
            </ul>
            <button className="btn btn-huge btn-honey" onClick={onContinue}>
              ▶ Continue
            </button>
            <p className="note">Try it now: move the cursor onto Continue and make a fist.</p>
          </>
        )}
      </div>
    </main>
  );
}
