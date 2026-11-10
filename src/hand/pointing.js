// Hand-landmark helpers shared by every gesture game.
// Landmark indices: 0 wrist · 5-8 index · 9-12 middle · 13-16 ring · 17-20 pinky.

const dist = (a, b, vw, vh) => Math.hypot((a.x - b.x) * vw, (a.y - b.y) * vh);

const reachRatio = (lm, tip, pip, vw, vh) =>
  dist(lm[0], lm[tip], vw, vh) / Math.max(dist(lm[0], lm[pip], vw, vh), 1e-6);

/** Index finger extended while at least two of the other three fingers are curled. */
export function isPointing(lm, vw, vh) {
  const indexOut =
    reachRatio(lm, 8, 6, vw, vh) > 1.1 && dist(lm[0], lm[8], vw, vh) > dist(lm[0], lm[5], vw, vh);
  const curled = [reachRatio(lm, 12, 10, vw, vh), reachRatio(lm, 16, 14, vw, vh), reachRatio(lm, 20, 18, vw, vh)].filter(
    (r) => r < 1.12,
  ).length;
  return indexOut && curled >= 2;
}

/** All four fingers curled into the palm. */
export function isFist(lm, vw, vh) {
  return [
    reachRatio(lm, 8, 6, vw, vh),
    reachRatio(lm, 12, 10, vw, vh),
    reachRatio(lm, 16, 14, vw, vh),
    reachRatio(lm, 20, 18, vw, vh),
  ].every((r) => r < 1.1);
}

/** Centre of the palm (wrist + finger knuckles). */
export function palmCenter(lm) {
  const ids = [0, 5, 9, 13, 17];
  return {
    x: ids.reduce((s, i) => s + lm[i].x, 0) / ids.length,
    y: ids.reduce((s, i) => s + lm[i].y, 0) / ids.length,
  };
}

// ---- custom gesture templates ---------------------------------------------

/**
 * Turns 21 landmarks into a pose vector that ignores hand size, position and
 * in-plane rotation (wrist→middle-knuckle is rotated to point up). Left hands are
 * mirrored so a gesture recorded with one hand also matches the other.
 */
export function poseVector(lm, vw, vh, flip) {
  const w = { x: lm[0].x * vw, y: lm[0].y * vh };
  const m = { x: lm[9].x * vw, y: lm[9].y * vh };
  const scale = Math.max(Math.hypot(m.x - w.x, m.y - w.y), 1e-6);
  const rot = -Math.PI / 2 - Math.atan2(m.y - w.y, m.x - w.x);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const out = [];
  for (const p of lm) {
    const rx = p.x * vw - w.x;
    const ry = p.y * vh - w.y;
    const x = (rx * c - ry * s) / scale;
    out.push(flip ? -x : x, (rx * s + ry * c) / scale);
  }
  return out;
}

/** Root-mean-square distance between two pose vectors (in palm lengths). */
export function poseDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 2) {
    const dx = a[i] - b[i];
    const dy = a[i + 1] - b[i + 1];
    sum += dx * dx + dy * dy;
  }
  return Math.sqrt(sum / (a.length / 2));
}

/** Averages recorded samples into a template, with a matching tolerance. */
export function buildTemplate(samples) {
  const n = samples.length;
  const mean = samples[0].map((_, i) => samples.reduce((s, v) => s + v[i], 0) / n);
  const spread = Math.max(...samples.map((v) => poseDistance(v, mean)));
  const threshold = Math.min(0.4, Math.max(0.16, spread * 1.5 + 0.04));

  // If one fingertip clearly sticks out the most, the blade follows it; otherwise the palm.
  const reach = (tip) => Math.hypot(mean[tip * 2], mean[tip * 2 + 1]);
  const index = reach(8);
  const others = Math.max(reach(12), reach(16), reach(20));
  const anchor = index > others * 1.2 ? 'tip' : 'palm';

  return { template: mean.map((v) => Math.round(v * 1000) / 1000), threshold: Math.round(threshold * 1000) / 1000, anchor, spread };
}

/**
 * Maps a normalised video coordinate to screen pixels, accounting for
 * object-fit: cover cropping and the mirrored (selfie) display.
 */
export function toScreen(nx, ny, { W, H, vw, vh }) {
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const x = nx * dw - (dw - W) / 2;
  const y = ny * dh - (dh - H) / 2;
  return { x: W - x, y };
}
