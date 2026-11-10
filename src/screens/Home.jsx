export default function Home({ onPlay }) {
  return (
    <main className="home">
      <div className="logo" aria-label="BeCozy">
        {'BeCozy'.split('').map((c, i) => (
          <span key={i} style={{ '--i': i }}>
            {c}
          </span>
        ))}
      </div>
      <p className="tagline">Cozy party games you play with your hands.</p>
      <button className="btn btn-huge btn-honey" onClick={onPlay}>
        ▶ Let's play
      </button>
      <div className="chips">
        <span className="chip">📷 Just a webcam</span>
        <span className="chip">👯 Up to 4 players</span>
        <span className="chip">🙌 No controllers</span>
      </div>
    </main>
  );
}
