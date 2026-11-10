import { Suspense, useEffect, useMemo, useState } from 'react';
import Home from './screens/Home.jsx';
import GameSelect from './screens/GameSelect.jsx';
import Setup from './screens/Setup.jsx';
import GestureRecorder from './screens/GestureRecorder.jsx';
import CameraGate from './screens/CameraGate.jsx';
import Leaderboard from './screens/Leaderboard.jsx';
import OnlineEntry from './screens/OnlineEntry.jsx';
import Lobby from './screens/Lobby.jsx';
import OnlineGame from './games/fruitNinja/OnlineGame.jsx';
import HandCursor from './components/HandCursor.jsx';
import { TrackerContext, useTracker } from './hand/useHandTracking.js';
import { getGame, loadSettings, saveSettings } from './games/registry.js';
import { getGesture, saveCustomGesture } from './hand/gestures.js';
import { unlockAudio } from './lib/sound.js';
import { loadProfile, saveProfile } from './online/profile.js';
import { useRoomSnapshot } from './online/useRoom.js';

const ONLINE_GAME = 'fruit-ninja';

export default function App() {
  // an invite link looks like  …/BeCozy/?room=ABCD
  const invite = useMemo(() => new URLSearchParams(window.location.search).get('room'), []);

  const [entered, setEntered] = useState(false); // passed the camera check
  const [screen, setScreen] = useState(invite ? 'online' : 'home'); // home | games | setup | record | play | leaderboard | online | room
  const [gameId, setGameId] = useState(invite ? ONLINE_GAME : null);
  const [settings, setSettings] = useState(() => (invite ? loadSettings(getGame(ONLINE_GAME)) : null));
  const [gameBusy, setGameBusy] = useState(false); // mid-round: hands belong to the game, not the menu cursor
  const [profile, setProfile] = useState(loadProfile);
  const [room, setRoom] = useState(null);
  const snap = useRoomSnapshot(room);

  const game = gameId ? getGame(gameId) : null;
  const participating = !!snap?.round?.players.includes(snap.meId);
  const roundOn = screen === 'room' && snap?.phase === 'playing' && participating;

  // the face model only loads when a face gesture (nose) is in use
  const needFaces =
    (!!game?.gestures && (screen === 'setup' || screen === 'play') && getGesture(settings?.gesture).kind === 'face') ||
    (screen === 'room' && getGesture(profile.gesture).kind === 'face');
  const tracker = useTracker({ faces: needFaces });

  // the camera is mandatory: show the gate until it works (and again if it drops)
  const gated = !entered || tracker.status === 'error';

  // browsers only unlock audio after a real click/tap/key (hand-cursor clicks are synthetic)
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // closing the tab should free the seat
  useEffect(() => {
    if (!room) return undefined;
    const bye = () => room.leave();
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [room]);

  const pickGame = (g) => {
    setGameId(g.id);
    setSettings(loadSettings(g));
    setScreen('setup');
  };

  const updateSettings = (next) => {
    setSettings(next);
    saveSettings(game, next);
  };

  const updateProfile = (patch) =>
    setProfile((p) => {
      const next = { ...p, ...patch };
      saveProfile(next);
      return next;
    });

  const leaveRoom = () => {
    room?.leave();
    setRoom(null);
    setGameBusy(false);
    if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
    setScreen('games');
  };

  let content;
  if (gated) {
    content = (
      <Backdrop>
        <CameraGate onContinue={() => setEntered(true)} />
      </Backdrop>
    );
  } else if (screen === 'record') {
    content = (
      <GestureRecorder
        onCancel={() => setScreen('setup')}
        onSave={(g) => {
          saveCustomGesture(g);
          updateSettings({ ...settings, gesture: g.id });
          setScreen('setup');
        }}
      />
    );
  } else if (screen === 'play' && game) {
    const Game = game.Component;
    content = (
      <Suspense
        fallback={
          <div className="screen center-screen">
            <div className="spin">{game.emoji}</div>
          </div>
        }
      >
        <Game settings={settings} onExit={() => setScreen('games')} onSettings={() => setScreen('setup')} onBusy={setGameBusy} />
      </Suspense>
    );
  } else if (screen === 'room' && room && snap) {
    if (snap.status === 'closed') {
      content = (
        <Backdrop>
          <main className="home">
            <div className="panel center">
              <div className="big-emoji">👋</div>
              <h2>You left the room</h2>
              <button className="btn btn-honey" onClick={leaveRoom}>
                Back to games
              </button>
            </div>
          </main>
        </Backdrop>
      );
    } else if (roundOn) {
      content = <OnlineGame room={room} profile={profile} onLeave={leaveRoom} onBusy={setGameBusy} />;
    } else {
      content = (
        <Backdrop>
          <Lobby room={room} game={getGame(ONLINE_GAME)} profile={profile} onProfile={updateProfile} onLeave={leaveRoom} />
        </Backdrop>
      );
    }
  } else {
    content = (
      <Backdrop>
        {screen === 'home' && <Home onPlay={() => setScreen('games')} />}
        {screen === 'games' && <GameSelect onPick={pickGame} onBack={() => setScreen('home')} onLeaderboard={() => setScreen('leaderboard')} />}
        {screen === 'leaderboard' && <Leaderboard onBack={() => setScreen('games')} />}
        {screen === 'setup' && game && (
          <Setup
            game={game}
            settings={settings}
            onChange={updateSettings}
            onBack={() => setScreen('games')}
            onStart={() => setScreen('play')}
            onRecord={() => setScreen('record')}
            onOnline={() => setScreen('online')}
          />
        )}
        {screen === 'online' && (
          <OnlineEntry
            game={getGame(ONLINE_GAME)}
            profile={profile}
            onProfile={updateProfile}
            initialCode={invite || ''}
            onBack={() => setScreen(game ? 'setup' : 'games')}
            onRoom={(r) => {
              setRoom(r);
              setScreen('room');
            }}
          />
        )}
      </Backdrop>
    );
  }

  const videoMode = !gated && (screen === 'play' || screen === 'record' || roundOn) ? 'bg' : 'pip';
  const cursorOn = tracker.status === 'ready' && screen !== 'record' && !gameBusy;

  return (
    <TrackerContext.Provider value={tracker}>
      {/* the one and only camera feed: a corner preview in menus, the game backdrop in play */}
      <video ref={tracker.videoRef} className={`cam-global ${videoMode} ${tracker.status === 'ready' ? 'live' : ''}`} playsInline muted />
      {content}
      <HandCursor enabled={cursorOn} />
    </TrackerContext.Provider>
  );
}

function Backdrop({ children }) {
  return (
    <div className="screen">
      <div className="floaters" aria-hidden="true">
        {['🍉', '🍊', '🍓', '🍋', '🍇', '🍑', '🥝', '🍎'].map((e, i) => (
          <span key={i} style={{ '--i': i }}>
            {e}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}
