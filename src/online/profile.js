import { randomSeed } from './bodies.js';

const KEY = 'becozy.profile';

/** The player's online identity, remembered between visits. */
export function loadProfile() {
  const base = { name: '', body: randomSeed(), gesture: 'point', share: true };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return base;
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* optional */
  }
}
