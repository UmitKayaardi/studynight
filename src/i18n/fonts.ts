/**
 * Script fonts (Noto Sans families, OFL) are loaded lazily — only for the active UI language or a quiz language
 * that needs them. Latin, Cyrillic, Greek and Vietnamese are covered by the base fonts (Inter + Nunito).
 * Fontsource CSS uses unicode-range slices, so only the glyph ranges actually used are downloaded.
 */

const loaded = new Map<string, Promise<void>>();

const SCRIPT_FONTS: Record<string, { load: () => Promise<unknown>; family: string }> = {
  arabic: {
    load: () =>
      import('@fontsource/noto-sans-arabic/400.css').then(
        () => import('@fontsource/noto-sans-arabic/700.css'),
      ),
    family: 'Noto Sans Arabic',
  },
  devanagari: {
    load: () =>
      import('@fontsource/noto-sans-devanagari/400.css').then(
        () => import('@fontsource/noto-sans-devanagari/700.css'),
      ),
    family: 'Noto Sans Devanagari',
  },
  bengali: {
    load: () =>
      import('@fontsource/noto-sans-bengali/400.css').then(
        () => import('@fontsource/noto-sans-bengali/700.css'),
      ),
    family: 'Noto Sans Bengali',
  },
  jp: {
    load: () =>
      import('@fontsource/noto-sans-jp/400.css').then(() => import('@fontsource/noto-sans-jp/700.css')),
    family: 'Noto Sans JP',
  },
  kr: {
    load: () =>
      import('@fontsource/noto-sans-kr/400.css').then(() => import('@fontsource/noto-sans-kr/700.css')),
    family: 'Noto Sans KR',
  },
  sc: {
    load: () =>
      import('@fontsource/noto-sans-sc/400.css').then(() => import('@fontsource/noto-sans-sc/700.css')),
    family: 'Noto Sans SC',
  },
};

/** Which script a language code needs (for quiz languages outside the UI list too). */
export function scriptForLanguage(code: string): string {
  const base = code.toLowerCase().split('-')[0];
  if (['ar', 'fa', 'ur', 'ps', 'sd', 'ug', 'ku'].includes(base!)) return 'arabic';
  if (['hi', 'mr', 'ne', 'sa'].includes(base!)) return 'devanagari';
  if (['bn', 'as'].includes(base!)) return 'bengali';
  if (base === 'ja') return 'jp';
  if (base === 'ko') return 'kr';
  if (base === 'zh') return 'sc';
  return 'latin';
}

export function loadScriptFont(script: string): Promise<void> {
  const def = SCRIPT_FONTS[script];
  const root = document.documentElement;
  if (!def) {
    root.style.removeProperty('--sn-font-script');
    return Promise.resolve();
  }
  root.style.setProperty('--sn-font-script', `'${def.family}'`);
  let p = loaded.get(script);
  if (!p) {
    p = def
      .load()
      .then(() => undefined)
      .catch(() => {
        loaded.delete(script); // offline: system fonts are used; retry next time
      });
    loaded.set(script, p);
  }
  return p;
}

/** Loads the font for a quiz language without changing the UI font variable. */
export function ensureFontForLanguage(code: string): void {
  const def = SCRIPT_FONTS[scriptForLanguage(code)];
  if (def && !loaded.has(scriptForLanguage(code))) {
    loaded.set(
      scriptForLanguage(code),
      def
        .load()
        .then(() => undefined)
        .catch(() => undefined),
    );
  }
}
