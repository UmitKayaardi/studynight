/** Original SVG art: logo, avatars, badge medals, boss. */
import { useId, type ComponentType } from 'react';
import {
  Award,
  BookOpen,
  Brain,
  CalendarCheck,
  Crown,
  Flame,
  Gauge,
  Globe,
  HelpCircle,
  Layers,
  MessageCircleQuestion,
  Moon,
  Mountain,
  RotateCcw,
  Send,
  Skull,
  Sparkles,
  Star,
  Sunrise,
  Target,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react';

const INK = '#141a3a';

export function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id={`lg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d2552" />
          <stop offset="1" stopColor="#0b1026" />
        </linearGradient>
        <mask id={`lm${id}`}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx="40" cy="25" r="16" fill="#000" />
        </mask>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#lg${id})`} />
      <circle cx="29" cy="34" r="20" fill="#ffc94d" mask={`url(#lm${id})`} />
      <path
        d="M46 36 l2.4 6.2 l6.2 2.4 l-6.2 2.4 l-2.4 6.2 l-2.4 -6.2 l-6.2 -2.4 l6.2 -2.4z"
        fill="#2ee6c5"
      />
    </svg>
  );
}

// ---- Avatars --------------------------------------------------------------------------------------------------------

export const AVATAR_COUNT = 16;
const AVATAR_COLOURS = [
  '#2ee6c5',
  '#ffc94d',
  '#c3b2ff',
  '#ffae8a',
  '#8fd3ff',
  '#9ef0a8',
  '#ff9fc1',
  '#d6ef6b',
];
const AVATAR_SHAPES = [
  'M32 4 a28 28 0 1 1 0 56 a28 28 0 1 1 0 -56z', // round
  'M18 6 h28 a12 12 0 0 1 12 12 v28 a12 12 0 0 1 -12 12 h-28 a12 12 0 0 1 -12 -12 v-28 a12 12 0 0 1 12 -12z', // squircle
  'M32 4 l24 14 v28 l-24 14 l-24 -14 v-28z', // hexagon
  'M32 4 c14 12 26 24 26 36 a26 26 0 0 1 -52 0 c0 -12 12 -24 26 -36z', // drop
];

/** 16 original "night friends": colour × shape × face combinations. */
export function Avatar({ index, size = 48, label }: { index: number; size?: number; label?: string }) {
  const i = ((index % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  const colour = AVATAR_COLOURS[i % 8]!;
  const shape = AVATAR_SHAPES[Math.floor(i / 4) % 4]!;
  const face = i % 3;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} {...a11y}>
      <path d={shape} fill={colour} stroke={INK} strokeWidth="2.5" />
      {i % 5 === 0 && (
        <ellipse cx="32" cy="40" rx="30" ry="6" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.7" />
      )}
      {face === 0 && (
        <g fill={INK}>
          <circle cx="24" cy="30" r="3.4" />
          <circle cx="40" cy="30" r="3.4" />
          <path d="M24 40 q8 7 16 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {face === 1 && (
        <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
          <path d="M20 31 q4 -5 8 0" />
          <path d="M36 31 q4 -5 8 0" />
          <path d="M26 40 q6 5 12 0" />
        </g>
      )}
      {face === 2 && (
        <g>
          <circle cx="24" cy="30" r="5" fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx="40" cy="30" r="5" fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx="25" cy="31" r="2.2" fill={INK} />
          <circle cx="41" cy="31" r="2.2" fill={INK} />
          <ellipse cx="32" cy="42" rx="3.5" ry="2.5" fill={INK} />
        </g>
      )}
      <ellipse cx="18" cy="38" rx="3" ry="2" fill="#ff8fa3" opacity="0.6" />
      <ellipse cx="46" cy="38" rx="3" ry="2" fill="#ff8fa3" opacity="0.6" />
    </svg>
  );
}

// ---- Badges ---------------------------------------------------------------------------------------------------------

type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean; strokeWidth?: number }>;
const BADGE_ART: Record<string, { icon: IconType; colour: string }> = {
  firstDeck: { icon: BookOpen, colour: '#2ee6c5' },
  firstQuiz: { icon: Sparkles, colour: '#8fd3ff' },
  firstBoss: { icon: Zap, colour: '#ffc94d' },
  streak7: { icon: Flame, colour: '#ffae8a' },
  streak30: { icon: Flame, colour: '#ff8f6b' },
  streak100: { icon: Crown, colour: '#ffc94d' },
  questions100: { icon: Target, colour: '#9ef0a8' },
  questions1000: { icon: Mountain, colour: '#c3b2ff' },
  perfectExam: { icon: Trophy, colour: '#ffc94d' },
  polyglot: { icon: Globe, colour: '#8fd3ff' },
  combo10: { icon: Gauge, colour: '#ff9fc1' },
  suddenDeath20: { icon: Skull, colour: '#c3b2ff' },
  flashcards100: { icon: Layers, colour: '#2ee6c5' },
  explainer: { icon: Brain, colour: '#ff9fc1' },
  curious: { icon: MessageCircleQuestion, colour: '#9ef0a8' },
  challenger: { icon: Send, colour: '#ffae8a' },
  planner: { icon: CalendarCheck, colour: '#8fd3ff' },
  level10: { icon: Star, colour: '#ffc94d' },
  marathon: { icon: Timer, colour: '#d6ef6b' },
  nightSession: { icon: Moon, colour: '#c3b2ff' },
  earlyStart: { icon: Sunrise, colour: '#ffae8a' },
  comeback: { icon: RotateCcw, colour: '#2ee6c5' },
};

export function BadgeMedal({ id, earned, size = 64 }: { id: string; earned: boolean; size?: number }) {
  const art = BADGE_ART[id] ?? { icon: Award, colour: '#2ee6c5' };
  const Icon = earned ? art.icon : HelpCircle;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width={size} height={size} className="absolute inset-0">
        <path
          d="M32 3 l25 14.5 v29 l-25 14.5 l-25 -14.5 v-29z"
          fill={earned ? art.colour : 'var(--sn-surface-2)'}
          stroke={earned ? INK : 'var(--sn-border)'}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M32 10 l19 11 v22 l-19 11 l-19 -11 v-22z"
          fill="none"
          stroke={earned ? '#ffffff' : 'var(--sn-border)'}
          strokeOpacity="0.55"
          strokeWidth="2"
        />
      </svg>
      <span className="relative" style={{ color: earned ? INK : 'var(--sn-text-muted)' }}>
        <Icon aria-hidden strokeWidth={2.4} />
      </span>
    </div>
  );
}

// ---- Boss -----------------------------------------------------------------------------------------------------------

/** An original, friendly storm-cloud "boss" — grumpy, not scary. */
export function StormBoss({
  hit,
  defeated,
  size = 140,
}: {
  hit?: boolean;
  defeated?: boolean;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 160 130"
      width={size}
      height={size * 0.8125}
      aria-hidden
      className={hit ? 'sn-shake' : ''}
    >
      <g opacity={defeated ? 0.35 : 1}>
        <path
          d="M78 104 l-10 22 l16 -14 l-4 16 l14 -24 h-12z"
          fill="#ffc94d"
          stroke={INK}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M40 100 a26 26 0 0 1 -4 -51 a32 32 0 0 1 58 -18 a26 26 0 0 1 40 26 a22 22 0 0 1 -8 43z"
          fill="#4a5490"
          stroke={INK}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M52 44 a22 22 0 0 1 30 -12"
          fill="none"
          stroke="#7f89c9"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {defeated ? (
          <g fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round">
            <path d="M58 62 l10 8 M68 62 l-10 8" />
            <path d="M94 62 l10 8 M104 62 l-10 8" />
            <path d="M70 86 q11 -8 22 0" />
          </g>
        ) : (
          <g>
            <path d="M54 56 l16 6" stroke={INK} strokeWidth="4" strokeLinecap="round" />
            <path d="M108 56 l-16 6" stroke={INK} strokeWidth="4" strokeLinecap="round" />
            <circle cx="64" cy="70" r="6" fill="#fff" />
            <circle cx="98" cy="70" r="6" fill="#fff" />
            <circle cx="65" cy="71" r="3" fill={INK} />
            <circle cx="97" cy="71" r="3" fill={INK} />
            <path d="M70 88 q11 -6 22 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          </g>
        )}
      </g>
    </svg>
  );
}
