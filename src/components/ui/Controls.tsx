/** Small reusable controls: card, ring, progress bar, toggle, segmented control, fields, chips, spinner. */
import {
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Circular progress ring (0–1). Colour is never the only signal: the label carries the value. */
export function Ring({
  value,
  size = 56,
  stroke = 6,
  color = 'var(--sn-accent)',
  label,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--sn-surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-display text-sm font-extrabold"
        aria-hidden
      >
        {children}
      </span>
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  tone = 'accent',
}: {
  value: number;
  label: string;
  tone?: 'accent' | 'star' | 'bad';
}) {
  const v = Math.min(1, Math.max(0, value));
  const color = tone === 'star' ? 'bg-star' : tone === 'bad' ? 'bg-bad' : 'bg-accent';
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <div
        className={`h-full rounded-full ${color} transition-[width] duration-500`}
        style={{ width: `${v * 100}%` }}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center gap-3 py-1">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-surface-2 border border-border'}`}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-white shadow transition-[inset-inline-start] ${checked ? 'start-7' : 'start-1'}`}
          aria-hidden
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-2xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 flex-1 rounded-xl px-3 font-display text-sm font-bold transition ${o.value === value ? 'bg-surface text-text shadow-card' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const fieldClass =
  'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none';

export function TextField({
  label,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        className={`${fieldClass} min-h-12`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <textarea id={id} className={`${fieldClass} min-h-32 resize-y`} {...rest} />
    </div>
  );
}

export function SelectField({
  label,
  options,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <select id={id} className={`${fieldClass} min-h-12 appearance-auto`} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'star' | 'good' | 'bad';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-text',
    star: 'bg-star-soft text-text',
    good: 'bg-good-soft text-good',
    bad: 'bg-bad-soft text-bad',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span
        className="size-5 animate-spin rounded-full border-2 border-accent border-e-transparent"
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
