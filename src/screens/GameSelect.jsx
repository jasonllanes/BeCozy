import { GAMES } from '../games/registry.js';

export default function GameSelect({ onPick, onBack }) {
  return (
    <main className="page">
      <header className="page-head">
        <button className="btn btn-small" onClick={onBack}>
          ← Back
        </button>
        <h1>Choose a game</h1>
      </header>

      <div className="game-grid">
        {GAMES.map((g) => (
          <button
            key={g.id}
            className={`game-card ${g.available ? '' : 'locked'}`}
            style={{ '--c': g.color }}
            disabled={!g.available}
            onClick={() => onPick(g)}
          >
            <span className="game-emoji">{g.emoji}</span>
            <span className="game-name">{g.name}</span>
            <span className="game-tag">{g.tagline}</span>
            <span className="game-meta">
              {g.available ? (
                <>
                  <span className="pill">👯 1–{g.maxPlayers}</span>
                  {g.gesture && <span className="pill">{g.gesture}</span>}
                </>
              ) : (
                <span className="pill">🔒 Coming soon</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
