import { useState } from 'react';
import OnScreenKeyboard from '../../components/OnScreenKeyboard.jsx';
import { leaderboardEnabled, submitScores } from '../../lib/leaderboard.js';

const NAMES_KEY = 'becozy.names';

function savedNames() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAMES_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/**
 * After a round, the high scorer (or tied high scorers) gets to put their name on the
 * global leaderboard. Works the same for solo, 2-, 3- and 4-player rounds.
 */
export default function ScorePoster({ players, settings, gesture, only = null, prefill = '' }) {
  const top = Math.max(...players.map((p) => p.score));
  const winners = top > 0 ? players.map((p, i) => ({ ...p, i })).filter((p) => p.score === top && (only === null || p.i === only)) : [];

  const [names, setNames] = useState(() => players.map((_, i) => (i === only && prefill ? prefill : savedNames()[i] || '')));
  const [kbFor, setKbFor] = useState(null); // index of the player whose name the on-screen keyboard edits
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [error, setError] = useState('');

  if (!leaderboardEnabled || winners.length === 0) return null;

  const solo = players.length === 1;
  const title = only !== null
    ? '🏆 You have the high score – enter your name!'
    : solo
    ? '🎉 Nice run! Put your name on the leaderboard'
    : winners.length > 1
      ? '🏆 It’s a tie! Winners, enter your names'
      : `🏆 ${winners[0].name} has the high score – enter your name!`;

  const setName = (i, value) => setNames((n) => n.map((v, k) => (k === i ? value : v)));

  const post = async () => {
    setState('sending');
    setKbFor(null);
    const classic = settings.mode === 'classic';
    try {
      await submitScores(
        winners.map((p) => ({
          game_id: 'fruit-ninja',
          mode: settings.mode,
          difficulty: settings.difficulty,
          duration_s: classic ? settings.duration : null,
          player_name: (names[p.i] || '').trim().slice(0, 16) || p.name,
          score: p.score,
          survived_s: Math.round(p.survived),
          sliced: p.sliced,
          gesture: gesture.custom ? 'custom' : gesture.id,
          players: players.length,
          stats: {
            winner: true,
            missed: p.missed,
            accuracy: p.accuracy,
            bombs: p.bombs,
            bestCombo: p.bestCombo,
            powerups: p.powerups,
            maxMult: p.maxMult,
            knockedOut: p.dead,
          },
        })),
      );
      try {
        const merged = savedNames();
        winners.forEach((p) => {
          if (names[p.i].trim()) merged[p.i] = names[p.i].trim();
        });
        localStorage.setItem(NAMES_KEY, JSON.stringify(merged));
      } catch {
        /* optional */
      }
      setState('done');
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <p className="poster-done">
        🏅 {winners.length > 1 ? 'Scores' : 'Score'} posted! See it under “Choose a game → Leaderboard”.
      </p>
    );
  }

  return (
    <div className="poster">
      <h3>{title}</h3>
      <div className="poster-names">
        {winners.map((p) => (
          <div key={p.name} className="poster-name" style={{ '--c': p.color }}>
            <span>{p.emoji}</span>
            <input
              className="text-input"
              value={names[p.i]}
              maxLength={16}
              placeholder={solo ? 'Your name' : `${p.name}'s name`}
              aria-label={`${p.name}'s leaderboard name`}
              onChange={(e) => setName(p.i, e.target.value)}
              onFocus={() => setKbFor(null)}
            />
            <button
              type="button"
              className={`osk-toggle ${kbFor === p.i ? 'on' : ''}`}
              onClick={() => setKbFor(kbFor === p.i ? null : p.i)}
              aria-label="Toggle on-screen keyboard"
              title="On-screen keyboard"
            >
              ⌨️
            </button>
            <b>{p.score}</b>
          </div>
        ))}
      </div>

      {kbFor !== null && <OnScreenKeyboard value={names[kbFor]} onChange={(v) => setName(kbFor, v)} onDone={() => setKbFor(null)} />}

      {state === 'error' && <p className="warn">{error}</p>}
      <button className="btn btn-honey" onClick={post} disabled={state === 'sending'}>
        {state === 'sending' ? 'Posting…' : state === 'error' ? '↻ Try again' : `🏅 Post to leaderboard`}
      </button>
      <p className="note">No name typed? We’ll use the player’s colour name.</p>
    </div>
  );
}
