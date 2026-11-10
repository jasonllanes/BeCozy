import { useContext, useState } from 'react';
import NameField from '../components/NameField.jsx';
import Avatar from '../components/Avatar.jsx';
import { TrackerContext } from '../hand/useHandTracking.js';
import { supabaseEnabled } from '../lib/leaderboard.js';
import { Room, cleanCode, makeCode } from '../online/room.js';

/** Step 1 of online play: pick a name, then create a room or join one with a code. */
export default function OnlineEntry({ game, profile, onProfile, initialCode = '', onBack, onRoom }) {
  const { stream } = useContext(TrackerContext);
  const [code, setCode] = useState(cleanCode(initialCode));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const name = profile.name.trim();
  const { gesture: _g, ...roomDefaults } = game.defaults;

  const enter = async (isCreator, wantedCode) => {
    setError('');
    setBusy(isCreator ? 'create' : 'join');
    const attempts = isCreator ? 4 : 1;
    for (let i = 0; i < attempts; i++) {
      const room = new Room({ code: isCreator ? makeCode() : wantedCode, isCreator, profile: { ...profile, name }, localStream: stream });
      try {
        await room.connect();
        if (isCreator) room.setSettings(roomDefaults);
        onRoom(room);
        return;
      } catch (e) {
        await room.leave();
        if (e.code !== 'COLLISION') {
          setError(e.message);
          break;
        }
      }
    }
    setBusy('');
  };

  if (!supabaseEnabled) {
    return (
      <main className="page">
        <header className="page-head">
          <button className="btn btn-small" onClick={onBack}>
            ← Back
          </button>
          <h1>🌐 Play online</h1>
        </header>
        <section className="card" style={{ '--c': '#FF7A59' }}>
          <h2>Online play isn’t set up</h2>
          <p className="note">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file (and to the GitHub Actions secrets for the live site), then restart.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page-head">
        <button className="btn btn-small" onClick={onBack}>
          ← Back
        </button>
        <h1>🌐 Play online</h1>
      </header>

      <div className="online-entry">
        <section className="card" style={{ '--c': '#FFC83D' }}>
          <h2>🙋 Who are you?</h2>
          <div className="entry-me">
            <Avatar body={profile.body} stream={stream} showCamera={profile.share} mirror size={120} />
            <div className="entry-me-fields">
              <NameField
                value={profile.name}
                onChange={(v) => onProfile({ name: v })}
                placeholder="Your name"
                label="Your name"
              />
              <p className="note">That’s you! Your camera becomes your head. You’ll choose your body in the lobby.</p>
            </div>
          </div>
        </section>

        <section className="card" style={{ '--c': '#4FC48A' }}>
          <h2>🏠 Host a room</h2>
          <p className="note">You pick the rules and share a 4-letter code with friends (up to 4 players).</p>
          <button className="btn btn-big btn-honey" disabled={!name || !!busy} onClick={() => enter(true)}>
            {busy === 'create' ? 'Building room…' : '＋ Create room'}
          </button>
        </section>

        <section className="card" style={{ '--c': '#6C8CFF' }}>
          <h2>🚪 Join a room</h2>
          <NameField value={code} onChange={(v) => setCode(cleanCode(v))} placeholder="ROOM CODE" label="Room code" max={4} caps="upper" />
          <button className="btn btn-big btn-honey" disabled={!name || code.length !== 4 || !!busy} onClick={() => enter(false, code)}>
            {busy === 'join' ? 'Joining…' : '→ Join room'}
          </button>
        </section>

        {!name && <p className="note center-note">Enter your name to continue.</p>}
        {error && <p className="warn center-note">{error}</p>}
      </div>
    </main>
  );
}
