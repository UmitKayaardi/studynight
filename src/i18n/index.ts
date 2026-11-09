/**
 * i18n runtime: 21 UI languages, English default (never auto-switched), locale files loaded lazily,
 * `lang`/`dir` set on <html>, script fonts loaded only for the active language.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import languages from './languages.json';
import en from './locales/en.json';
import { loadScriptFont } from './fonts';

export interface LanguageInfo {
  code: string;
  name: string;
  dir: 'ltr' | 'rtl';
  script: string;
}

export const LANGUAGES = languages as LanguageInfo[];
export const UI_LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

const loaders = import.meta.glob<{ default: Record<string, unknown> }>([
  './locales/*.json',
  '!./locales/en.json',
]);

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
}

export async function initI18n(language: string): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false }, // React escapes
    returnNull: false,
  });
  await setLanguage(language);
}

export async function setLanguage(code: string): Promise<void> {
  const info = languageInfo(code);
  if (info.code !== 'en' && !i18n.hasResourceBundle(info.code, 'translation')) {
    const load = loaders[`./locales/${info.code}.json`];
    if (load) i18n.addResourceBundle(info.code, 'translation', (await load()).default, true, true);
  }
  await Promise.all([i18n.changeLanguage(info.code), loadScriptFont(info.script)]);
  const html = document.documentElement;
  html.lang = info.code;
  html.dir = info.dir;
}

export default i18n;
