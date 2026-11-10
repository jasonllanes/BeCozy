import { isFist, isPointing, palmCenter, poseDistance, poseVector, toScreen } from './pointing.js';

// A gesture turns raw tracking data into "pointers": a screen position plus
// whether the gesture is currently being performed (`active`). Any pointer-style
// game can use any gesture.

export const PRESETS = [
  {
    id: 'point',
    kind: 'hand',
    name: 'Point',
    emoji: '☝️',
    desc: 'Index finger out, other fingers curled',
    prompt: 'point here!',
    hint: '☝️ point with one finger',
    cheer: 'Point ☝️ & swipe to slice!',
    how: 'Raise your hand and point with your index finger ☝️ (other fingers curled), then swipe through the fruit.',
    speed: 1,
  },
  {
    id: 'fist',
    kind: 'hand',
    name: 'Fist',
    emoji: '✊',
    desc: 'Close your hand into a fist',
    prompt: 'fist up here!',
    hint: '✊ make a fist',
    cheer: 'Fist ✊ & swipe to slice!',
    how: 'Raise your hand and make a fist ✊, then punch through the fruit.',
    speed: 1,
  },
  {
    id: 'nose',
    kind: 'face',
    name: 'Nose',
    emoji: '👃',
    desc: 'Your nose is the blade! Move your head',
    prompt: 'nose in here!',
    hint: '',
    cheer: 'Nose 👃 & swish to slice!',
    how: 'Your nose 👃 is the blade! Face the camera and move your head through the fruit. Stand about 1–2 m away.',
    speed: 0.5,
  },
];

const KEY = 'becozy.gestures';

function decorate(g) {
  if (!g.custom) return g;
  return {
    speed: 1,
    prompt: `show ${g.name}!`,
    hint: `${g.emoji} ${g.name}`,
    cheer: `${g.emoji} ${g.name} & swipe!`,
    desc: 'Your recorded gesture',
    how: `Make your "${g.name}" gesture ${g.emoji} and swipe it through the fruit.`,
    ...g,
  };
}

export function loadCustomGestures() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]').map(decorate);
  } catch {
    return [];
  }
}

function writeCustom(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage is optional */
  }
}

export function saveCustomGesture(g) {
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');
  writeCustom([...list, { ...g, custom: true, kind: 'hand' }]);
}

export function deleteCustomGesture(id) {
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');
  writeCustom(list.filter((g) => g.id !== id));
}

export function getGesture(id) {
  return PRESETS.find((p) => p.id === id) || loadCustomGestures().find((g) => g.id === id) || PRESETS[0];
}

/** Does this hand currently perform the (hand-kind) gesture? */
export function handMatches(g, hand, vw, vh) {
  if (g.id === 'point') return isPointing(hand.lm, vw, vh);
  if (g.id === 'fist') return isFist(hand.lm, vw, vh);
  if (g.template) return poseDistance(poseVector(hand.lm, vw, vh, hand.flip), g.template) < g.threshold;
  return false;
}

function handAnchor(g, lm) {
  if (g.id === 'point') return lm[8];
  if (g.id === 'fist') return palmCenter(lm);
  return g.anchor === 'tip' ? lm[8] : palmCenter(lm);
}

/** Convert one tracking frame into screen-space pointers for the chosen gesture. */
export function readPointers(g, frame, view) {
  if (g.kind === 'face') {
    return frame.faces.map((f) => ({ ...toScreen(f.x, f.y, view), active: true }));
  }
  return frame.hands.map((h) => {
    const a = handAnchor(g, h.lm);
    return { ...toScreen(a.x, a.y, view), active: handMatches(g, h, view.vw, view.vh) };
  });
}
