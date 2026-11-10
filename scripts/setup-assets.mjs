// Copies the MediaPipe WASM runtime and downloads the hand model into /public
// so the game runs fully offline after the first install.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDest = join(root, 'public', 'mediapipe', 'wasm');

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDest, { recursive: true });
  cpSync(wasmSrc, wasmDest, { recursive: true });
  console.log('✔ MediaPipe WASM copied to public/mediapipe/wasm');
} else {
  console.warn('! @mediapipe/tasks-vision not installed yet, skipping WASM copy');
}

const MODELS = [
  [join(root, 'public', 'models', 'hand_landmarker.task'), 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
  [join(root, 'public', 'models', 'face_detector.tflite'), 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'],
];

for (const [dest, url] of MODELS) {
  if (existsSync(dest)) {
    console.log('✔ Model already present:', basename(dest));
    continue;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log('✔ Downloaded', basename(dest));
  } catch (err) {
    console.warn('! Could not download ' + url + ' (' + err.message + ')');
    console.warn('  Save it manually to ' + dest);
    if (process.env.CI) process.exitCode = 1;
  }
}
