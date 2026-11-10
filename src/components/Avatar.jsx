import { useEffect, useId, useMemo, useRef } from 'react';
import { bodyFromSeed } from '../online/bodies.js';

const INK = '#3B2418';
const VB = { w: 120, top: -20, h: 190 }; // viewBox "0 -20 120 190": extra room on top for hats
// head circle: centre (60, 38), radius 28
const HEAD = { cx: 60, cy: 38, r: 28 };

function Torso({ shape, ...p }) {
  switch (shape) {
    case 'tall':
      return <rect x="39" y="66" width="42" height="64" rx="20" {...p} />;
    case 'chubby':
      return <ellipse cx="60" cy="102" rx="38" ry="32" {...p} />;
    case 'bean':
      return <path d="M40 74 Q60 60 80 74 Q92 100 78 128 Q60 138 42 128 Q28 100 40 74Z" {...p} />;
    case 'square':
      return <rect x="33" y="68" width="54" height="60" rx="12" {...p} />;
    case 'pear':
      return <path d="M48 66 Q60 62 72 66 Q80 86 92 112 Q92 134 60 134 Q28 134 28 112 Q40 86 48 66Z" {...p} />;
    default:
      return <ellipse cx="60" cy="102" rx="30" ry="34" {...p} />;
  }
}

const ARMS = {
  down: [[[44, 80], [30, 110]], [[76, 80], [90, 110]]],
  wave: [[[44, 80], [30, 110]], [[76, 80], [97, 58]]],
  cheer: [[[44, 80], [26, 54]], [[76, 80], [94, 54]]],
  hips: [[[44, 80], [22, 98], [42, 112]], [[76, 80], [98, 98], [78, 112]]],
};

function Arm({ pts, color, skin }) {
  const d = pts.map((p) => p.join(',')).join(' ');
  const end = pts[pts.length - 1];
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polyline points={d} stroke={INK} strokeWidth="15" />
      <polyline points={d} stroke={color} strokeWidth="9" />
      <circle cx={end[0]} cy={end[1]} r="7" fill={skin} stroke={INK} strokeWidth="3" />
    </g>
  );
}

function Pattern({ type, color2 }) {
  if (type === 'stripes') {
    return [70, 84, 98, 112, 126].map((y) => <rect key={y} x="20" y={y} width="80" height="7" fill={color2} opacity="0.9" />);
  }
  if (type === 'dots') {
    const dots = [];
    for (let y = 76; y < 136; y += 16) for (let x = 36; x < 90; x += 16) dots.push(<circle key={`${x}-${y}`} cx={x + ((y / 16) % 2) * 8} cy={y} r="4" fill={color2} />);
    return dots;
  }
  if (type === 'belly') return <ellipse cx="60" cy="114" rx="17" ry="15" fill="#fff" opacity="0.6" />;
  if (type === 'zigzag') return <polyline points="24,96 36,86 48,96 60,86 72,96 84,86 96,96 96,106 84,96 72,106 60,96 48,106 36,96 24,106" fill={color2} />;
  return null;
}

function Hat({ type, b }) {
  const o = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' };
  switch (type) {
    case 'beanie':
      return (
        <g {...o}>
          <path d="M33 24 Q60 -14 87 24 Z" fill={b.color2} />
          <rect x="31" y="20" width="58" height="9" rx="4" fill="#fff" />
          <circle cx="60" cy="-6" r="7" fill="#fff" />
        </g>
      );
    case 'chef':
      return (
        <g {...o} fill="#fff">
          <circle cx="45" cy="0" r="12" />
          <circle cx="60" cy="-8" r="13" />
          <circle cx="75" cy="0" r="12" />
          <rect x="41" y="4" width="38" height="15" rx="3" />
        </g>
      );
    case 'crown':
      return <path d="M36 16 L36 -2 L48 8 L60 -8 L72 8 L84 -2 L84 16Z" fill="#FFC83D" {...o} />;
    case 'bunny':
      return (
        <g {...o}>
          <ellipse cx="45" cy="-6" rx="8" ry="20" fill="#fff" transform="rotate(-10 45 -6)" />
          <ellipse cx="75" cy="-6" rx="8" ry="20" fill="#fff" transform="rotate(10 75 -6)" />
          <ellipse cx="45" cy="-4" rx="3.5" ry="13" fill="#FF9EB5" transform="rotate(-10 45 -4)" stroke="none" />
          <ellipse cx="75" cy="-4" rx="3.5" ry="13" fill="#FF9EB5" transform="rotate(10 75 -4)" stroke="none" />
        </g>
      );
    case 'sprout':
      return (
        <g {...o}>
          <path d="M60 12 L60 -4" fill="none" strokeLinecap="round" />
          <ellipse cx="50" cy="-6" rx="11" ry="6" fill="#6BCB77" transform="rotate(-25 50 -6)" />
          <ellipse cx="70" cy="-6" rx="11" ry="6" fill="#4FC48A" transform="rotate(25 70 -6)" />
        </g>
      );
    case 'party':
      return (
        <g {...o}>
          <path d="M60 -24 L42 16 L78 16 Z" fill={b.color2} />
          <circle cx="60" cy="-24" r="5" fill="#FFC83D" />
          <path d="M50 4 L70 4 M46 12 L74 12" stroke="#fff" fill="none" />
        </g>
      );
    case 'cap':
      return (
        <g {...o}>
          <path d="M33 22 Q60 -10 87 22 Z" fill={b.color} />
          <path d="M58 22 L96 22 Q102 22 102 28 L58 28 Z" fill={b.color2} />
        </g>
      );
    default:
      return null;
  }
}

/**
 * A generated body with the player's camera as the head.
 *   body   – integer seed (see online/bodies.js)
 *   stream – MediaStream for the head; with showCamera=false (or no stream) an emoji face is used
 *   mirror – flip the video (selfie view for your own head)
 *   size   – pixel width; height follows the aspect ratio
 */
export default function Avatar({ body, stream, showCamera = true, mirror = false, size = 140, className = '' }) {
  const b = useMemo(() => bodyFromSeed(body), [body]);
  const uid = useId().replace(/:/g, '');
  const videoRef = useRef(null);
  const live = !!stream && showCamera;

  useEffect(() => {
    const v = videoRef.current;
    if (v && v.srcObject !== (live ? stream : null)) v.srcObject = live ? stream : null;
  }, [stream, live]);

  const arms = ARMS[b.pose];
  const H = (size * VB.h) / VB.w;
  const pct = (v, total) => `${(v / total) * 100}%`;

  return (
    <div className={`avatar ${className}`} style={{ width: size, height: H }}>
      <svg className="avatar-layer" viewBox={`0 ${VB.top} ${VB.w} ${VB.h}`} aria-hidden="true">
        <defs>
          <clipPath id={`clip-${uid}`}>
            <Torso shape={b.shape} />
          </clipPath>
        </defs>

        {/* ground shadow */}
        <ellipse cx="60" cy="161" rx="30" ry="5" fill={INK} opacity="0.18" />

        {b.acc === 'cape' && <path d="M38 70 L16 142 Q60 154 104 142 L82 70Z" fill={b.color2} stroke={INK} strokeWidth="4" strokeLinejoin="round" />}

        {/* legs + shoes */}
        {[48, 72].map((x) => (
          <g key={x}>
            <rect x={x - 5} y="122" width="11" height="32" rx="5" fill={b.skin} stroke={INK} strokeWidth="4" />
            <ellipse cx={x + 0.5} cy="157" rx="12" ry="6.5" fill={b.shoes} stroke={INK} strokeWidth="4" />
          </g>
        ))}

        <Arm pts={arms[0]} color={b.color} skin={b.skin} />
        <Arm pts={arms[1]} color={b.color} skin={b.skin} />

        <Torso shape={b.shape} fill={b.color} stroke={INK} strokeWidth="4" />
        <g clipPath={`url(#clip-${uid})`}>
          <Pattern type={b.pattern} color2={b.color2} />
        </g>
        <Torso shape={b.shape} fill="none" stroke={INK} strokeWidth="4" />

        {b.acc === 'apron' && <path d="M47 92 H73 V128 Q60 134 47 128Z" fill="#fff" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />}
        {b.acc === 'scarf' && (
          <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
            <rect x="40" y="64" width="40" height="11" rx="5" fill={b.color2} />
            <rect x="68" y="70" width="9" height="20" rx="4" fill={b.color2} />
          </g>
        )}
        {b.acc === 'bowtie' && (
          <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
            <path d="M60 74 L46 66 L46 82Z M60 74 L74 66 L74 82Z" fill="#FF5D73" />
            <circle cx="60" cy="74" r="4" fill="#FF5D73" />
          </g>
        )}
      </svg>

      {/* the head: live camera (or emoji fallback) */}
      <div
        className="avatar-head"
        style={{
          left: pct(HEAD.cx - HEAD.r, VB.w),
          top: pct(HEAD.cy - HEAD.r - VB.top, VB.h),
          width: pct(HEAD.r * 2, VB.w),
          height: pct(HEAD.r * 2, VB.h),
          background: b.skin,
        }}
      >
        {live ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ transform: `scale(${mirror ? -1.3 : 1.3}, 1.3)` }}
          />
        ) : (
          <span className="avatar-face" style={{ fontSize: size * 0.3 }}>
            {b.face}
          </span>
        )}
      </div>

      <svg className="avatar-layer" viewBox={`0 ${VB.top} ${VB.w} ${VB.h}`} aria-hidden="true">
        <Hat type={b.hat} b={b} />
      </svg>
    </div>
  );
}
