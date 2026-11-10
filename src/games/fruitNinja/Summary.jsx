import ScorePoster from './ScorePoster.jsx';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Fun superlatives, only handed out when there's a clear winner of the category.
function awards(players, survival) {
  if (players.length < 2) return [];
  const list = [];
  const pick = (emoji, title, score, min = 1) => {
    const best = Math.max(...players.map(score));
    const holders = players.filter((p) => score(p) === best);
    if (best >= min && holders.length === 1) list.push({ emoji, title, who: holders[0] });
  };
  pick('🍉', 'Top slicer', (p) => p.sliced, 3);
  pick('🔥', 'Combo king', (p) => p.bestCombo, 3);
  pick('🎯', 'Sharpshooter', (p) => p.accuracy, 30);
  pick('⭐', 'Power hunter', (p) => p.powerups, 2);
  if (survival) pick('🛡️', 'Last one standing', (p) => Math.round(p.survived), 5);
  else pick('💣', 'Bomb magnet', (p) => p.bombs, 2);
  return list;
}

function Stat({ emoji, label, value }) {
  return (
    <div className="stat">
      <span className="stat-emoji">{emoji}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function Summary({ data, settings, gesture, onAgain, onSettings, onExit, actions = null, meIndex = null, prefill = '' }) {
  const { players, playTime, best } = data;
  const survival = settings.mode === 'survival';
  const solo = players.length === 1;
  const ranked = [...players].sort((a, b) => b.score - a.score || b.survived - a.survived);
  const topScore = ranked[0].score;
  const winners = ranked.filter((p) => p.score === topScore);
  const given = awards(players, survival);

  const title = solo
    ? survival
      ? `You survived ${fmtTime(players[0].survived)}!`
      : `You scored ${players[0].score}!`
    : winners.length > 1
      ? "It's a tie! 🤝"
      : `${winners[0].name} wins!`;

  return (
    <div className="overlay overlay-dim">
      <div className="panel summary">
        <div className="summary-head">
          <div className="big-emoji">{solo ? (best?.isNew ? '🎉' : '🍉') : '🏆'}</div>
          <h2>{title}</h2>
          <div className="row tags">
            <span className="pill">{survival ? '❤️ Survival' : `⏱ Classic · ${settings.duration}s`}</span>
            <span className="pill">
              {{ chill: '🌿', normal: '🍊', spicy: '🌶️' }[settings.difficulty]} {settings.difficulty}
            </span>
            <span className="pill">
              {gesture.emoji} {gesture.name}
            </span>
            <span className="pill">⏳ Played {fmtTime(playTime)}</span>
          </div>
          {solo && best && (
            <p className="best">{best.isNew ? `🎉 New personal best! (was ${best.prev})` : `Personal best: ${Math.max(best.prev, players[0].score)}`}</p>
          )}
        </div>

        <div className="summary-cards">
          {ranked.map((p, i) => (
            <article
              key={p.name}
              className={`sum-card ${!solo && p.score === topScore ? 'top' : ''}`}
              style={{ '--c': p.color, '--d': p.dark }}
            >
              <header>
                {!solo && <span className="rank-pos">{i + 1}</span>}
                <span className="sum-name">
                  {p.emoji} {p.name}
                  {p.dead && <small>💀 knocked out at {fmtTime(p.survived)}</small>}
                  {survival && !p.dead && <small>🛡️ survived with {p.hp} ❤️</small>}
                </span>
                <span className="sum-score">{p.score}</span>
              </header>
              <div className="stats">
                <Stat emoji="🍉" label="Sliced" value={p.sliced} />
                <Stat emoji="🎯" label="Accuracy" value={`${p.accuracy}%`} />
                <Stat emoji="🔥" label="Best combo" value={`x${p.bestCombo}`} />
                <Stat emoji="💣" label="Bombs hit" value={p.bombs} />
                <Stat emoji="⭐" label="Power-ups" value={p.powerups} />
                <Stat emoji="✖️" label="Top multiplier" value={`x${p.maxMult}`} />
                <Stat emoji="💨" label="Missed" value={p.missed} />
                <Stat emoji={p.topFruit || '🍽️'} label="Fave fruit" value={p.topFruit ? '' : '—'} />
              </div>
            </article>
          ))}
        </div>

        {given.length > 0 && (
          <div className="awards">
            {given.map((a) => (
              <span key={a.title} className="award" style={{ '--c': a.who.color }}>
                {a.emoji} {a.title}: <b>{a.who.name}</b>
              </span>
            ))}
          </div>
        )}

        <ScorePoster players={players} settings={settings} gesture={gesture} only={meIndex} prefill={prefill} />

        <div className="row">
          {actions || (
            <>
              <button className="btn btn-big btn-honey" onClick={onAgain}>
                ↻ Play again
              </button>
              <button className="btn" onClick={onSettings}>
                ⚙ Settings
              </button>
              <button className="btn" onClick={onExit}>
                🏠 Games
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
