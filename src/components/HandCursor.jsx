import { useContext, useEffect, useRef, useState } from 'react';
import { TrackerContext } from '../hand/useHandTracking.js';
import { isFist, isPointing, palmCenter, toScreen } from '../hand/pointing.js';

const CLICKABLE = 'button:not(:disabled)';
const DWELL_MS = 1400; // hold a pointing finger still on a button to select it
const COOLDOWN_MS = 900;
const LOST_MS = 450;
const ICON = { open: '✋', point: '☝️', fist: '✊' };
const RING = 2 * Math.PI * 30;

/**
 * Hand-powered mouse for the menus.
 *   ✋ open palm / ☝️ pointing finger → move the cursor
 *   ✊ close your fist                → click what's under the cursor
 *   ☝️ hold a pointing finger still   → click after a short dwell (ring fills up)
 * Near the top/bottom edge of the screen it scrolls the page.
 */
export default function HandCursor({ enabled }) {
  const { detect, videoRef, status } = useContext(TrackerContext);
  const cursorRef = useRef(null);
  const ringRef = useRef(null);
  const [mode, setMode] = useState('none'); // none | open | point | fist

  useEffect(() => {
    if (!enabled || status !== 'ready') {
      setMode('none');
      return undefined;
    }
    const st = {
      target: null, // where the hand wants the cursor
      shown: null, // smoothed on-screen position
      mode: 'none',
      lastRes: null,
      lastSeen: 0,
      fistFrames: 0,
      openFrames: 0,
      fistClicked: false,
      lastClick: 0,
      hover: null,
      hoverSince: 0,
    };
    let raf = 0;

    const clickAt = (el, now) => {
      st.lastClick = now;
      st.hoverSince = now + COOLDOWN_MS;
      const c = cursorRef.current;
      c?.classList.remove('click');
      void c?.offsetWidth;
      c?.classList.add('click');
      el.click();
    };

    const setHover = (el, now) => {
      if (el === st.hover) return;
      st.hover?.classList.remove('hand-hover');
      st.hover = el;
      st.hoverSince = now;
      el?.classList.add('hand-hover');
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      const W = window.innerWidth;
      const H = window.innerHeight;

      // --- read a new tracking frame ------------------------------------
      const res = detect();
      if (res !== st.lastRes && video?.videoWidth) {
        st.lastRes = res;
        const hand = res.hands[0];
        if (hand) {
          st.lastSeen = now;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const pointing = isPointing(hand.lm, vw, vh);
          const fist = !pointing && isFist(hand.lm, vw, vh);
          if (fist) {
            // freeze the cursor where it was just before the fist closed
            st.fistFrames++;
            st.mode = 'fist';
            if (st.fistFrames >= 3 && !st.fistClicked && st.openFrames >= 4 && now - st.lastClick > COOLDOWN_MS && st.shown) {
              st.fistClicked = true;
              const el = document.elementFromPoint(st.shown.x, st.shown.y)?.closest(CLICKABLE);
              if (el) clickAt(el, now);
            }
          } else {
            st.fistFrames = 0;
            st.fistClicked = false;
            st.openFrames++;
            st.mode = pointing ? 'point' : 'open';
            const a = pointing ? hand.lm[8] : palmCenter(hand.lm);
            const p = toScreen(a.x, a.y, { W, H, vw, vh });
            // use the middle 76% of the camera frame to reach the whole screen
            st.target = {
              x: Math.min(1, Math.max(0, (p.x / W - 0.12) / 0.76)) * W,
              y: Math.min(1, Math.max(0, (p.y / H - 0.12) / 0.76)) * H,
            };
          }
        }
      }

      const c = cursorRef.current;
      if (!c) return;
      if (!st.target || now - st.lastSeen > LOST_MS) {
        if (st.mode !== 'none') {
          st.mode = 'none';
          st.openFrames = 0;
          st.fistFrames = 0;
          st.shown = null;
          setHover(null, now);
          setMode('none');
        }
        c.style.opacity = '0';
        return;
      }

      // --- animate -------------------------------------------------------
      st.shown = st.shown
        ? { x: st.shown.x + (st.target.x - st.shown.x) * 0.3, y: st.shown.y + (st.target.y - st.shown.y) * 0.3 }
        : { ...st.target };
      c.style.opacity = '1';
      c.style.transform = `translate(${st.shown.x - 32}px, ${st.shown.y - 32}px)`;
      setMode((m) => (m === st.mode ? m : st.mode));

      const under = document.elementFromPoint(st.shown.x, st.shown.y);
      const el = under?.closest(CLICKABLE) || null;
      setHover(el, now);

      // dwell progress (pointing finger only)
      let progress = 0;
      if (el && st.mode === 'point' && now > st.hoverSince) {
        progress = Math.min(1, (now - st.hoverSince) / DWELL_MS);
        if (progress >= 1) {
          clickAt(el, now);
          progress = 0;
        }
      }
      ringRef.current?.setAttribute('stroke-dashoffset', String(RING * (1 - progress)));

      // edge scrolling when not over a button
      if (!el && st.mode !== 'fist') {
        const edge = st.shown.y < H * 0.1 ? -1 : st.shown.y > H * 0.9 ? 1 : 0;
        if (edge) (document.querySelector('.summary') || window).scrollBy({ top: edge * 14 });
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      st.hover?.classList.remove('hand-hover');
    };
  }, [enabled, status, detect, videoRef]);

  return (
    <div ref={cursorRef} className={`hand-cursor ${mode}`} aria-hidden="true" style={{ opacity: 0 }}>
      <svg viewBox="0 0 68 68" width="68" height="68">
        <circle cx="34" cy="34" r="30" className="hc-bg" />
        <circle ref={ringRef} cx="34" cy="34" r="30" className="hc-ring" strokeDasharray={RING} strokeDashoffset={RING} />
      </svg>
      <span>{ICON[mode] || ICON.open}</span>
    </div>
  );
}
