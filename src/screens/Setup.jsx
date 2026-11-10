import { useState } from 'react';
import { PLAYERS } from '../lib/players.js';
import { computeZones } from '../lib/zones.js';
import { PRESETS, deleteCustomGesture, loadCustomGestures } from '../hand/gestures.js';

export function Choice({ options, value, onChange }) {
  const help = options.find((o) => o.value === value)?.help;
  return (
    <>
      <div className="seg">
        {options.map((o) => (
          <button key={o.value} className={`seg-btn ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
            {o.emoji && <span>{o.emoji}</span>} {o.label}
          </button>
        ))}
      </div>
      {help && <p className="note">{help}</p>}
    </>
  );
}

export function Toggle({ label, hint, emoji, value, onChange }) {
  return (
    <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span className="toggle-emoji">{emoji}</span>
      <span className="toggle-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="switch">
        <span />
      </span>
    </button>
  );
}

function SplitPreview({ players, layout }) {
  const zones = computeZones(players, layout, 100, 56.25);
  return (
    <div className="split">
      {zones.map((z) => (
        <div
          key={z.index}
          className="split-zone"
          style={{
            left: `${z.x}%`,
            top: `${(z.y / 56.25) * 100}%`,
            width: `${z.w}%`,
            height: `${(z.h / 56.25) * 100}%`,
            '--c': PLAYERS[z.index].color,
            '--d': PLAYERS[z.index].dark,
          }}
        >
          <span>{PLAYERS[z.index].emoji}</span>
          <b>P{z.index + 1}</b>
        </div>
      ))}
    </div>
  );
}

export function GesturePicker({ value, onChange, onRecord, canRecord = true }) {
  const [customs, setCustoms] = useState(loadCustomGestures);
  const remove = (id) => {
    deleteCustomGesture(id);
    setCustoms(loadCustomGestures());
    if (value === id) onChange('point');
  };
  const all = [...PRESETS, ...customs];
  const current = all.find((g) => g.id === value);

  return (
    <>
      <div className="gesture-grid">
        {all.map((g) => (
          <div key={g.id} className={`gesture-tile ${g.id === value ? 'on' : ''}`}>
            <button className="gesture-main" onClick={() => onChange(g.id)} aria-pressed={g.id === value}>
              <span className="gesture-emoji">{g.emoji}</span>
              <span className="gesture-name">{g.name}</span>
              {g.custom && <span className="gesture-tag">yours</span>}
            </button>
            {g.custom && (
              <button className="gesture-del" onClick={() => remove(g.id)} aria-label={`Delete ${g.name}`} title="Delete">
                ✕
              </button>
            )}
          </div>
        ))}
        {canRecord && (
          <button className="gesture-tile gesture-add" onClick={onRecord}>
            <span className="gesture-emoji">＋</span>
            <span className="gesture-name">Record your own</span>
          </button>
        )}
      </div>
      {current && <p className="note">{current.desc}.</p>}
    </>
  );
}

export default function Setup({ game, settings, onChange, onBack, onStart, onRecord, onOnline }) {
  const set = (key) => (value) => onChange({ ...settings, [key]: value });
  const layoutOptions =
    settings.players === 2
      ? [
          { value: 'columns', label: 'Side by side', emoji: '↔️' },
          { value: 'grid', label: 'Stacked', emoji: '↕️' },
        ]
      : [
          { value: 'columns', label: 'Side by side', emoji: '↔️' },
          { value: 'grid', label: 'Grid', emoji: '▦' },
        ];

  return (
    <main className="page">
      <header className="page-head">
        <button className="btn btn-small" onClick={onBack}>
          ← Games
        </button>
        <h1>
          <span className="head-emoji">{game.emoji}</span> {game.name}
        </h1>
      </header>

      <div className="setup-grid">
        <section className="card" style={{ '--c': '#FFC83D' }}>
          <h2>👯 Players</h2>
          <div className="player-picker">
            {Array.from({ length: game.maxPlayers }, (_, i) => i + 1).map((n) => (
              <button key={n} className={`player-btn ${settings.players === n ? 'on' : ''}`} onClick={() => set('players')(n)}>
                <span className="player-num">{n}</span>
                <span className="player-faces">{PLAYERS.slice(0, n).map((p) => p.emoji).join('')}</span>
              </button>
            ))}
          </div>

          <SplitPreview players={settings.players} layout={settings.layout} />

          {settings.players > 1 && (
            <>
              <h3>Screen split</h3>
              <Choice options={layoutOptions} value={settings.layout} onChange={set('layout')} />
            </>
          )}
          <p className="note">The screen is divided so every player gets their own section. Stand so your hand stays inside your colour.</p>
        </section>

        <section className="card" style={{ '--c': '#FF7A59' }}>
          <h2>🎛️ {game.name} settings</h2>
          {game.settings
            .filter((f) => !f.showIf || f.showIf(settings))
            .map((f) =>
              f.type === 'choice' ? (
                <div className="field" key={f.key}>
                  <h3>{f.label}</h3>
                  <Choice options={f.options} value={settings[f.key]} onChange={set(f.key)} />
                </div>
              ) : (
                <Toggle key={f.key} label={f.label} hint={f.hint} emoji={f.emoji} value={settings[f.key]} onChange={set(f.key)} />
              ),
            )}
        </section>

        <div className="col">
          {game.gestures && (
            <section className="card" style={{ '--c': '#6C8CFF' }}>
              <h2>🖐️ Gesture</h2>
              <p className="note">Pick how everyone slices – or teach the game your own hand pose.</p>
              <GesturePicker value={settings.gesture} onChange={set('gesture')} onRecord={onRecord} />
            </section>
          )}

          <section className="card" style={{ '--c': '#4FC48A' }}>
            <h2>🏡 Room</h2>
            <Toggle label="Show camera" hint="See yourself behind the fruit" emoji="📷" value={settings.showCamera} onChange={set('showCamera')} />
            <Toggle label="Sound" hint="Swooshes, pops and jingles" emoji="🔊" value={settings.sound} onChange={set('sound')} />
          </section>
        </div>
      </div>

      <div className="start-bar">
        <button className="btn btn-huge btn-honey" onClick={onStart}>
          ▶ Play here
        </button>
        {game.online && onOnline && (
          <button className="btn btn-huge btn-berry" onClick={onOnline}>
            🌐 Play online
          </button>
        )}
      </div>
    </main>
  );
}
