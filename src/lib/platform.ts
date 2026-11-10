/** Haptics, theme, reduced motion and formatting helpers. */
import i18n from 'i18next';
import type { ThemeSetting } from '../db/repo';

let hapticsOn = true;
export function setHapticsEnabled(on: boolean): void {
  hapticsOn = on;
}

export type Haptic = 'tap' | 'correct' | 'wrong' | 'celebrate';
const PATTERNS: Record<Haptic, number | number[]> = {
  tap: 8,
  correct: 18,
  wrong: [30, 40, 30],
  celebrate: [20, 30, 20, 30, 60],
};

export function haptic(kind: Haptic): void {
  if (!hapticsOn || reducedMotion()) return;
  try {
    navigator.vibrate?.(PATTERNS[kind]);
  } catch {
    /* unsupported */
  }
}

// ---- Theme -------------------------------------------------------------------------------------------------------

const darkQuery = () =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function resolvedTheme(setting: ThemeSetting): 'light' | 'dark' {
  if (setting === 'system') return darkQuery()?.matches ? 'dark' : 'light';
  return setting;
}

export function applyTheme(setting: ThemeSetting): void {
  const theme = resolvedTheme(setting);
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('sn-theme', setting);
  } catch {
    /* storage blocked */
  }
  const meta = document.querySelectorAll('meta[name="theme-color"]');
  meta.forEach((m) => m.setAttribute('content', theme === 'dark' ? '#0b1026' : '#fbf8f1'));
}

export function onSystemThemeChange(fn: () => void): () => void {
  const q = darkQuery();
  q?.addEventListener('change', fn);
  return () => q?.removeEventListener('change', fn);
}

// ---- Reduced motion ----------------------------------------------------------------------------------------------

let motionOverride: boolean | null = null;

export function setReducedMotionOverride(v: boolean | null): void {
  motionOverride = v;
  document.documentElement.dataset.reducedMotion = String(reducedMotion());
}

export function reducedMotion(): boolean {
  if (motionOverride !== null) return motionOverride;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---- Formatting (always in the UI language) ------------------------------------------------------------------------

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(i18n.language || 'en', opts).format(n);
}

export function formatPercent(fraction: number): string {
  return formatNumber(fraction, { style: 'percent', maximumFractionDigits: 0 });
}

export function formatDate(
  d: Date | number | string,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
): string {
  // Day keys ("2026-05-04") are read as local noon; full timestamps are parsed as they are.
  const date = typeof d === 'string' && d.length === 10 ? new Date(`${d}T12:00:00`) : new Date(d);
  return new Intl.DateTimeFormat(i18n.language || 'en', opts).format(date);
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60)
    return formatNumber(Math.max(totalMin, ms > 0 ? 1 : 0), {
      style: 'unit',
      unit: 'minute',
      unitDisplay: 'short',
    });
  const h = Math.floor(totalMin / 60);
  return formatNumber(h, { style: 'unit', unit: 'hour', unitDisplay: 'short' });
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? formatNumber(mb, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 })
    : formatNumber(Math.max(1, Math.round(bytes / 1024)), { style: 'unit', unit: 'kilobyte' });
}

/** Display name of a language in the current UI language (e.g. "Turkish" / "Türkçe"). */
export function languageDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames([i18n.language || 'en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
