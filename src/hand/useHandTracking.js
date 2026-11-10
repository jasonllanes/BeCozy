import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { FaceDetector, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;
const EMPTY = { hands: [], faces: [] };
const MAX_HANDS = 6;

/** Shared tracker (camera + hand/face models) provided once at the app root. */
export const TrackerContext = createContext(null);

function friendlyError(e) {
  const name = e?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission was blocked. Allow camera access in your browser (look for the camera icon in the address bar) and try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return "We couldn't find a webcam. Plug one in and try again.";
  }
  if (name === 'NotReadableError') {
    return 'Your camera is busy in another app. Close it and try again.';
  }
  return e?.message || 'Something went wrong starting hand tracking.';
}

async function withFallback(make) {
  try {
    return await make('GPU');
  } catch {
    return make('CPU');
  }
}

/**
 * Owns the webcam and the MediaPipe models for the whole app.
 *   - The camera + hand model start immediately and stay alive across screens.
 *   - The face model (nose gesture) loads only while `faces` is true.
 * Attach `videoRef` to ONE <video>; call `detect()` every animation frame. It
 * returns { hands: [{ lm, flip }], faces: [{ x, y }] } – the same object until
 * a new camera frame has been processed.
 * status: 'loading' | 'ready' | 'error'
 */
export function useTracker({ faces = false } = {}) {
  const videoRef = useRef(null);
  const handRef = useRef(null);
  const faceRef = useRef(null);
  const filesetRef = useRef(null);
  const lastTime = useRef(-1);
  const latest = useRef(EMPTY);
  const [camera, setCamera] = useState('loading'); // loading | ready | error
  const [handsReady, setHandsReady] = useState(false);
  const [facesReady, setFacesReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const fail = useCallback((e) => {
    console.error(e);
    setError(friendlyError(e));
    setCamera('error');
  }, []);

  // 1) camera + wasm runtime
  useEffect(() => {
    let cancelled = false;
    let stream = null;
    setCamera('loading');
    setError('');
    latest.current = EMPTY;
    lastTime.current = -1;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser has no camera support. Try the latest Chrome, Edge or Safari.');
        }
        const [s, fileset] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: false,
          }),
          FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`),
        ]);
        stream = s;
        if (cancelled) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        filesetRef.current = fileset;
        if (!cancelled) setCamera('ready');
      } catch (e) {
        if (!cancelled) fail(e);
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [attempt, fail]);

  // 2) hand model (always)
  useEffect(() => {
    if (camera !== 'ready') return undefined;
    let cancelled = false;
    withFallback((delegate) =>
      HandLandmarker.createFromOptions(filesetRef.current, {
        baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate },
        runningMode: 'VIDEO',
        numHands: MAX_HANDS,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
    )
      .then((m) => {
        if (cancelled) return m.close();
        handRef.current = m;
        setHandsReady(true);
      })
      .catch((e) => !cancelled && fail(e));
    return () => {
      cancelled = true;
      handRef.current?.close();
      handRef.current = null;
      setHandsReady(false);
    };
  }, [camera, fail]);

  // 3) face model (only when a face gesture needs it)
  useEffect(() => {
    if (camera !== 'ready' || !faces) return undefined;
    let cancelled = false;
    withFallback((delegate) =>
      FaceDetector.createFromOptions(filesetRef.current, {
        baseOptions: { modelAssetPath: `${BASE}models/face_detector.tflite`, delegate },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      }),
    )
      .then((m) => {
        if (cancelled) return m.close();
        faceRef.current = m;
        setFacesReady(true);
      })
      .catch((e) => !cancelled && fail(e));
    return () => {
      cancelled = true;
      faceRef.current?.close();
      faceRef.current = null;
      setFacesReady(false);
    };
  }, [camera, faces, fail]);

  const status = camera === 'error' ? 'error' : camera === 'ready' && handsReady && (!faces || facesReady) ? 'ready' : 'loading';

  const detect = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 2 || (!handRef.current && !faceRef.current)) return latest.current;
    if (v.currentTime !== lastTime.current) {
      lastTime.current = v.currentTime;
      const ts = performance.now();
      const next = { hands: [], faces: [] };
      if (handRef.current) {
        const r = handRef.current.detectForVideo(v, ts);
        next.hands = (r.landmarks || []).map((lm, i) => ({ lm, flip: r.handedness?.[i]?.[0]?.categoryName === 'Left' }));
      }
      if (faceRef.current) {
        const r = faceRef.current.detectForVideo(v, ts);
        next.faces = (r.detections || [])
          .map((d) => d.keypoints?.[2])
          .filter(Boolean)
          .map((k) => ({ x: k.x, y: k.y }));
      }
      latest.current = next;
    }
    return latest.current;
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { videoRef, status, error, detect, retry };
}
