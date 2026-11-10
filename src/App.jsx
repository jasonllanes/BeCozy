import { Suspense, useState } from 'react';
import Home from './screens/Home.jsx';
import GameSelect from './screens/GameSelect.jsx';
import Setup from './screens/Setup.jsx';
import GestureRecorder from './screens/GestureRecorder.jsx';
import CameraGate from './screens/CameraGate.jsx';
import HandCursor from './components/HandCursor.jsx';
import { TrackerContext, useTracker } from './hand/useHandTracking.js';
import { getGame, loadSettings, saveSettings } from './games/registry.js';
import { getGesture, saveCustomGesture } from './hand/gestures.js';

export default function App() {
  const [entered, setEntered] = useState(false); // passed the camera check
  const [screen, setScreen] = useState('home'); // home | games | setup | record | play
  const [gameId, setGameId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [gameBusy, setGameBusy] = useState(false); // mid-round: hands belong to the game, not the menu cursor

  const game = gameId ? getGame(gameId) : null;

  // the face model only loads when a face gesture (nose) is chosen
  const needFaces = !!game?.gestures && (screen === 'setup' || screen === 'play') && getGesture(settings?.gesture).kind === 'face';
  const tracker = useTracker({ faces: needFaces });

  // the camera is mandatory: show the gate until it works (and again if it drops)
  const gated = !entered || tracker.status === 'error';
  const inGame = screen === 'play' || screen === 'record';

  const pickGame = (g) => {
    setGameId(g.id);
    setSettings(loadSettings(g));
    setScreen('setup');
  };

  const updateSettings = (next) => {
    setSettings(next);
    saveSettings(game, next);
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
        <Game
          settings={settings}
          onExit={() => setScreen('games')}
          onSettings={() => setScreen('setup')}
          onBusy={setGameBusy}
        />
      </Suspense>
    );
  } else {
    content = (
      <Backdrop>
        {screen === 'home' && <Home onPlay={() => setScreen('games')} />}
        {screen === 'games' && <GameSelect onPick={pickGame} onBack={() => setScreen('home')} />}
        {screen === 'setup' && game && (
          <Setup
            game={game}
            settings={settings}
            onChange={updateSettings}
            onBack={() => setScreen('games')}
            onStart={() => setScreen('play')}
            onRecord={() => setScreen('record')}
          />
        )}
      </Backdrop>
    );
  }

  const videoMode = gated ? 'pip' : inGame ? 'bg' : 'pip';
  const cursorOn = tracker.status === 'ready' && screen !== 'record' && !(screen === 'play' && gameBusy) && !(gated && tracker.status !== 'ready');

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
