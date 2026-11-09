/**
 * "Lumi", StudyNight's mascot: an original crescent-moon character with a tiny companion star.
 * Six expressions; four colour themes. Pure SVG drawn for this project.
 */
import { useId } from 'react';

export type MascotMood = 'happy' | 'thinking' | 'celebrating' | 'sleepy' | 'encouraging' | 'surprised';
export const MASCOT_MOODS: MascotMood[] = [
  'happy',
  'thinking',
  'celebrating',
  'sleepy',
  'encouraging',
  'surprised',
];
export const MASCOT_THEMES = [
  { body: '#ffc94d', shade: '#f0a92e', star: '#2ee6c5' },
  { body: '#2ee6c5', shade: '#18b89c', star: '#ffc94d' },
  { body: '#c3b2ff', shade: '#9b85f0', star: '#ffc94d' },
  { body: '#ffae8a', shade: '#ee8a63', star: '#2ee6c5' },
];

const INK = '#141a3a';

function Eyes({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case 'celebrating':
      return (
        <g fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round">
          <path d="M26 58 q4 -6 8 0" />
          <path d="M42 62 q4 -6 8 0" />
        </g>
      );
    case 'sleepy':
      return (
        <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
          <path d="M26 58 q4 4 8 0" />
          <path d="M42 62 q4 4 8 0" />
        </g>
      );
    case 'encouraging':
      return (
        <g>
          <ellipse cx="30" cy="57" rx="3.6" ry="4.8" fill={INK} />
          <circle cx="31.2" cy="55.4" r="1.3" fill="#fff" />
          <path d="M42 62 q4 -5 8 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'surprised':
      return (
        <g>
          <circle cx="30" cy="56" r="5.6" fill="#fff" stroke={INK} strokeWidth="2.4" />
          <circle cx="30" cy="56" r="2.6" fill={INK} />
          <circle cx="46" cy="60" r="5.6" fill="#fff" stroke={INK} strokeWidth="2.4" />
          <circle cx="46" cy="60" r="2.6" fill={INK} />
        </g>
      );
    case 'thinking':
      return (
        <g fill={INK}>
          <ellipse cx="31" cy="54" rx="3.4" ry="4.6" />
          <ellipse cx="47" cy="58" rx="3.4" ry="4.6" />
          <circle cx="32" cy="52.4" r="1.2" fill="#fff" />
          <circle cx="48" cy="56.4" r="1.2" fill="#fff" />
        </g>
      );
    default:
      return (
        <g fill={INK}>
          <ellipse cx="30" cy="57" rx="3.6" ry="4.8" />
          <ellipse cx="46" cy="61" rx="3.6" ry="4.8" />
          <circle cx="31.2" cy="55.4" r="1.3" fill="#fff" />
          <circle cx="47.2" cy="59.4" r="1.3" fill="#fff" />
        </g>
      );
  }
}

function Mouth({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case 'celebrating':
      return (
        <path
          d="M28 70 q9 14 18 4 q-9 2 -18 -4z"
          fill={INK}
          stroke={INK}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
    case 'surprised':
      return <ellipse cx="37" cy="75" rx="4" ry="5" fill={INK} />;
    case 'sleepy':
      return <ellipse cx="37" cy="73" rx="2.6" ry="2" fill={INK} />;
    case 'thinking':
      return <path d="M32 74 q6 -2 10 1" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
    default:
      return <path d="M29 70 q8 9 16 2" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />;
  }
}

function Extras({ mood, star }: { mood: MascotMood; star: string }) {
  switch (mood) {
    case 'sleepy':
      return (
        <g fill="none" stroke={star} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M70 30 h9 l-9 10 h9" />
          <path d="M86 16 h6 l-6 7 h6" />
        </g>
      );
    case 'thinking':
      return (
        <g fill={star}>
          <circle cx="72" cy="36" r="3" />
          <circle cx="82" cy="26" r="4" />
          <circle cx="94" cy="14" r="5.5" />
        </g>
      );
    case 'celebrating':
      return (
        <g>
          <path d="M14 26 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3z" fill={star} />
          <path d="M100 96 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2z" fill="#ff8fb1" />
          <circle cx="104" cy="70" r="3" fill="#8fd3ff" />
          <circle cx="20" cy="104" r="3" fill="#ffc94d" />
        </g>
      );
    case 'surprised':
      return (
        <g stroke={star} strokeWidth="3" strokeLinecap="round">
          <path d="M14 30 l6 6" />
          <path d="M10 44 l8 1" />
          <path d="M24 22 l2 8" />
        </g>
      );
    default:
      return null;
  }
}

export function Mascot({
  mood = 'happy',
  theme = 0,
  size = 120,
  label,
  className = '',
}: {
  mood?: MascotMood;
  theme?: number;
  size?: number;
  /** Accessible description; omit when purely decorative. */
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const t = MASCOT_THEMES[theme % MASCOT_THEMES.length]!;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} {...a11y}>
      <defs>
        <mask id={`m${id}`}>
          <rect width="120" height="120" fill="#fff" />
          <circle cx="90" cy="44" r="35" fill="#000" />
        </mask>
        <clipPath id={`c${id}`}>
          <circle cx="58" cy="62" r="47" />
        </clipPath>
        <radialGradient id={`g${id}`} cx="35%" cy="40%" r="70%">
          <stop offset="0%" stopColor={t.body} />
          <stop offset="100%" stopColor={t.shade} />
        </radialGradient>
      </defs>
      <g className="sn-float">
        <circle cx="58" cy="62" r="47" fill={`url(#g${id})`} mask={`url(#m${id})`} />
        <circle cx="58" cy="62" r="47" fill="none" stroke={INK} strokeWidth="3" mask={`url(#m${id})`} />
        <circle cx="90" cy="44" r="35" fill="none" stroke={INK} strokeWidth="3" clipPath={`url(#c${id})`} />
        {/* craters */}
        <circle cx="22" cy="80" r="4" fill={t.shade} opacity="0.7" />
        <circle cx="40" cy="94" r="3" fill={t.shade} opacity="0.7" />
        {/* cheeks */}
        <ellipse cx="24" cy="66" rx="4" ry="2.6" fill="#ff8fa3" opacity="0.55" />
        <ellipse cx="52" cy="71" rx="4" ry="2.6" fill="#ff8fa3" opacity="0.55" />
        <Eyes mood={mood} />
        <Mouth mood={mood} />
      </g>
      {/* companion star */}
      <path
        className="sn-twinkle"
        d="M98 70 l3.2 8.4 l8.4 3.2 l-8.4 3.2 l-3.2 8.4 l-3.2 -8.4 l-8.4 -3.2 l8.4 -3.2z"
        fill={t.star}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <Extras mood={mood} star={t.star} />
    </svg>
  );
}
