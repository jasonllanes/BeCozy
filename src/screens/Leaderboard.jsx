import { useEffect, useState } from 'react';
import { Choice } from './Setup.jsx';
import { fetchTop, leaderboardEnabled } from '../lib/leaderboard.js';

const MODES = [
  { value: 'classic', label: 'Classic', emoji: '⏱' },
  { value: 'survival', label: 'Survival', emoji: '❤️' },
];
const DIFFICULTIES = [
  { value: 'chill', label: 'Chill', emoji: '🌿' },
  { value: 'normal', label: 'Normal', emoji: '🍊' },
  { value: 'spicy', label: 'Spicy', emoji: '🌶️' },
];
const DURATIONS = [
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 90, label: '90s' },
];
const GESTURE_EMOJI = { point: '☝️', fist: '✊', nose: '👃', custom: '🤟' };
const MEDALS = ['🥇', '🥈', '🥉'];

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Leaderboard({ onBack }) {
  const [mode, setMode] = useState('classic');
  const [difficulty, setDifficulty] = useState('normal');
  const [duration, setDuration] = useState(60);
  const [rows, setRows] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!leaderboardEnabled) return undefined;
    let cancelled = false;
    setRows(null);
    setError('');
    fetchTop({ gameId: 'fruit-ninja', mode, difficulty, duration: mode === 'classic' ? duration : null })
      .then((data) => !cancelled && setRows(data))
      .catch((e) => !cancelled && (setError(e.message), setRows([])));
    return () => {
      cancelled = true;
    };
  }, [mode, difficulty, duration, nonce]);

  return (
    <main className="page">
      <header className="page-head">
        <button className="btn btn-small" onClick={onBack}>
          ← Games
        </button>
        <h1>🏆 Leaderboard</h1>
        <button className="btn btn-small push-right" onClick={() => setNonce((n) => n + 1)} disabled={!leaderboardEnabled}>
          ↻ Refresh
        </button>
      </header>

      <section className="card" style={{ '--c': '#FFC83D' }}>
        <h2>🍉 Fruit Ninja</h2>
        <div className="lb-filters">
          <Choice options={MODES} value={mode} onChange={setMode} />
          <Choice options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />
          {mode === 'classic' && <Choice options={DURATIONS} value={duration} onChange={setDuration} />}
        </div>

        {!leaderboardEnabled && (
          <p className="note">The leaderboard isn’t connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.</p>
        )}
        {leaderboardEnabled && rows === null && <p className="note">Loading scores…</p>}
        {error && <p className="warn">{error}</p>}
        {rows && !error && rows.length === 0 && <p className="note">No scores here yet – be the first! 🍓</p>}

        {rows && rows.length > 0 && (
          <ol className="lb">
            {rows.map((r, i) => (
              <li key={r.id} className={i < 3 ? 'lb-top' : ''}>
                <span className="lb-rank">{MEDALS[i] || i + 1}</span>
                <span className="lb-name">
                  {r.player_name}
                  <small>
                    {GESTURE_EMOJI[r.gesture] || '🎮'} {r.sliced} sliced
                    {mode === 'survival' && r.survived_s != null ? ` · ${fmtTime(r.survived_s)}` : ''}
                    {r.players > 1 ? ` · ${r.players}P` : ''} · {new Date(r.created_at).toLocaleDateString()}
                  </small>
                </span>
                <span className="lb-score">{r.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
