// Tiny WebAudio sound kit – no audio files needed.
let ctx = null;
let enabled = true;
let noiseBuf = null;

export function setSoundEnabled(v) {
  enabled = v;
}

export function unlockAudio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* audio is optional */
  }
}

function tone({ freq, to, dur = 0.15, type = 'sine', vol = 0.12, delay = 0 }) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.15, freq = 3000 }) {
  if (!enabled || !ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = freq > 1000 ? 'highpass' : 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  slice() {
    noise({ dur: 0.12, vol: 0.1, freq: 3500 });
    tone({ freq: 620 + Math.random() * 300, to: 1300, dur: 0.1, type: 'triangle', vol: 0.07 });
  },
  combo() {
    [660, 830, 990].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'triangle', vol: 0.08, delay: i * 0.07 }));
  },
  bomb() {
    noise({ dur: 0.5, vol: 0.28, freq: 600 });
    tone({ freq: 130, to: 40, dur: 0.45, type: 'sawtooth', vol: 0.18 });
  },
  power() {
    [523, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'sine', vol: 0.09, delay: i * 0.05 }));
  },
  heal() {
    [659, 880].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'sine', vol: 0.1, delay: i * 0.09 }));
  },
  over() {
    [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.1, delay: i * 0.16 }));
  },
  tick() {
    tone({ freq: 520, dur: 0.12, type: 'square', vol: 0.05 });
  },
  go() {
    tone({ freq: 784, dur: 0.3, type: 'square', vol: 0.06 });
    tone({ freq: 1046, dur: 0.4, type: 'square', vol: 0.06, delay: 0.1 });
  },
  end() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.1, delay: i * 0.12 }));
  },
};
