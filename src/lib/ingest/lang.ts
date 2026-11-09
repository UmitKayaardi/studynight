/**
 * Language detection of the notes: franc-min (trigram model, deterministic) with a script-based fallback for
 * short or mixed text. Returns a BCP-47 code or 'und'. The topic-extraction call can still correct 'und'.
 */
import { franc } from 'franc-min';

const ISO3_TO_BCP47: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  por: 'pt',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  nld: 'nl',
  pol: 'pl',
  tur: 'tr',
  rus: 'ru',
  ukr: 'uk',
  arb: 'ar',
  pes: 'fa',
  urd: 'ur',
  hin: 'hi',
  ben: 'bn',
  ind: 'id',
  zlm: 'ms',
  vie: 'vi',
  jpn: 'ja',
  kor: 'ko',
  cmn: 'zh',
  swe: 'sv',
  dan: 'da',
  nob: 'no',
  fin: 'fi',
  ces: 'cs',
  slk: 'sk',
  hun: 'hu',
  ron: 'ro',
  bul: 'bg',
  ell: 'el',
  heb: 'he',
  tha: 'th',
  tam: 'ta',
  tel: 'te',
  mar: 'mr',
  guj: 'gu',
  kan: 'kn',
  mal: 'ml',
  pan: 'pa',
  swh: 'sw',
  tgl: 'tl',
  hrv: 'hr',
  srp: 'sr',
  azj: 'az',
  uzn: 'uz',
  kaz: 'kk',
  amh: 'am',
  hau: 'ha',
  yor: 'yo',
  ibo: 'ig',
  zul: 'zu',
  som: 'so',
};

const SCRIPT_FALLBACK: Array<[RegExp, string]> = [
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'ja'],
  [/\p{Script=Hangul}/u, 'ko'],
  [/\p{Script=Han}/u, 'zh'],
  [/\p{Script=Bengali}/u, 'bn'],
  [/\p{Script=Devanagari}/u, 'hi'],
  [/\p{Script=Thai}/u, 'th'],
  [/\p{Script=Greek}/u, 'el'],
  [/\p{Script=Hebrew}/u, 'he'],
];

export function detectLanguage(text: string): string {
  const sample = text.slice(0, 20_000);
  // Kana is decisive for Japanese even when Han characters dominate.
  const kana = sample.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
  if (kana > 20) return 'ja';
  const code = franc(sample, { minLength: 20 });
  if (code !== 'und' && ISO3_TO_BCP47[code]) return ISO3_TO_BCP47[code]!;
  for (const [re, lang] of SCRIPT_FALLBACK) {
    const n = sample.match(new RegExp(re.source, 'gu'))?.length ?? 0;
    if (n > 10) return lang;
  }
  return 'und';
}
