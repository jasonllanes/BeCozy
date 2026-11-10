import { lazy } from 'react';

// Settings every game shares. Per-game settings live in each game's `settings` list.
export const COMMON_DEFAULTS = { players: 2, layout: 'columns', showCamera: true, sound: true };

/**
 * To add a game: create a component that receives { settings, onExit, onSettings },
 * then add an entry below. It shows up in "Choose a Game" automatically, and its
 * `settings` fields are rendered on the setup screen.
 *
 *  - `gestures: true` shows the gesture picker (stored as settings.gesture)
 *  - a field's `showIf(settings)` hides it when it doesn't apply
 *  - choice options may carry a `help` line shown under the selector
 */
export const GAMES = [
  {
    id: 'fruit-ninja',
    name: 'Fruit Ninja',
    emoji: '🍉',
    tagline: 'Slice the fruit with your hand – or your nose!',
    gesture: '☝️ ✊ 👃 or your own',
    color: '#FF7A59',
    maxPlayers: 4,
    available: true,
    gestures: true,
    online: true,
    Component: lazy(() => import('./fruitNinja/FruitNinja.jsx')),
    defaults: { mode: 'classic', difficulty: 'normal', duration: 60, bombs: true, powerups: true, trail: true, gesture: 'point' },
    settings: [
      {
        key: 'mode',
        label: 'Game mode',
        type: 'choice',
        options: [
          { value: 'classic', label: 'Classic', emoji: '⏱', help: 'Race the clock – score as much as you can before time runs out.' },
          { value: 'survival', label: 'Survival', emoji: '❤️', help: '3 lives, no timer. Every bomb you slice costs a life – at 0 you’re out!' },
        ],
      },
      {
        key: 'difficulty',
        label: 'Difficulty',
        type: 'choice',
        options: [
          { value: 'chill', label: 'Chill', emoji: '🌿' },
          { value: 'normal', label: 'Normal', emoji: '🍊' },
          { value: 'spicy', label: 'Spicy', emoji: '🌶️' },
        ],
      },
      {
        key: 'duration',
        label: 'Round length',
        type: 'choice',
        showIf: (s) => s.mode === 'classic',
        options: [
          { value: 30, label: '30s' },
          { value: 60, label: '60s' },
          { value: 90, label: '90s' },
        ],
      },
      {
        key: 'bombs',
        label: 'Bombs',
        hint: 'Slicing one costs 25 points',
        emoji: '💣',
        type: 'toggle',
        showIf: (s) => s.mode === 'classic',
      },
      {
        key: 'powerups',
        label: 'Power-ups',
        hint: '❄️ slow-mo · ⭐ x2 · 🔥 x3 · 💖 +1 life',
        emoji: '⚡',
        type: 'toggle',
      },
      { key: 'trail', label: 'Blade trail', hint: 'Show a glowing swipe', emoji: '✨', type: 'toggle' },
    ],
  },
  {
    id: 'bubble-pop',
    name: 'Bubble Pop',
    emoji: '🫧',
    tagline: 'Pop floating bubbles with a pinch.',
    color: '#6C8CFF',
    maxPlayers: 4,
    available: false,
  },
  {
    id: 'lantern-catch',
    name: 'Lantern Catch',
    emoji: '🏮',
    tagline: 'Catch falling lanterns with open palms.',
    color: '#4FC48A',
    maxPlayers: 4,
    available: false,
  },
];

export const getGame = (id) => GAMES.find((g) => g.id === id);

const key = (id) => `becozy.settings.${id}`;

export function loadSettings(game) {
  const base = { ...COMMON_DEFAULTS, ...game.defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(key(game.id)) || '{}');
    const merged = { ...base, ...saved };
    merged.players = Math.min(merged.players, game.maxPlayers);
    return merged;
  } catch {
    return base;
  }
}

export function saveSettings(game, settings) {
  try {
    localStorage.setItem(key(game.id), JSON.stringify(settings));
  } catch {
    /* storage is optional */
  }
}
