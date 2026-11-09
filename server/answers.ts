/** Explain-answer grading, Ask-your-notes, image reading and transcription. */
import type {
  AskRequest,
  AskResponse,
  GradeRequest,
  GradeResponse,
  ReadImageRequest,
  ReadImageResponse,
  TranscribeRequest,
  TranscribeResponse,
} from '../shared/api.js';
import { getConfig } from './env.js';
import { ApiError } from './errors.js';
import { chatJson, transcribe as groqTranscribe } from './groq.js';
import { askSystem, askUser, gradeSystem, gradeUser, READ_IMAGE_SYSTEM } from './prompts.js';

/** The grader only reports which key points are covered; the app computes the score. */
export async function grade(req: GradeRequest): Promise<GradeResponse> {
  if (!req.answer.trim()) {
    return { covered: req.keyPoints.map(() => false), feedback: req.keyPoints.map(() => '') };
  }
  const cfg = getConfig();
  const out = (await chatJson({
    model: cfg.verifier,
    fallbackModel: cfg.verifierFallback,
    system: gradeSystem(req.language),
    user: gradeUser(req),
    temperature: 0,
    maxTokens: 1500,
    timeoutMs: 25_000,
    reasoningEffort: 'low',
  })) as { covered?: unknown; feedback?: unknown };
  const n = req.keyPoints.length;
  const covered = Array.from({ length: n }, (_, i) =>
    Array.isArray(out.covered) ? out.covered[i] === true : false,
  );
  const feedback = Array.from({ length: n }, (_, i) => {
    const f = Array.isArray(out.feedback) ? out.feedback[i] : '';
    return covered[i] ? '' : typeof f === 'string' ? f.slice(0, 300) : '';
  });
  return { covered, feedback };
}

export async function ask(req: AskRequest): Promise<AskResponse> {
  const cfg = getConfig();
  const out = (await chatJson({
    model: cfg.generator,
    fallbackModel: cfg.generatorFallback,
    system: askSystem(req.language),
    user: askUser(req.question, req.passages),
    temperature: 0.2,
    maxTokens: 2000,
    timeoutMs: 25_000,
    reasoningEffort: 'low',
  })) as { found?: unknown; answer?: unknown; citations?: unknown };
  const valid = new Set(req.passages.map((p) => p.n));
  const answer = typeof out.answer === 'string' ? out.answer.trim().slice(0, 2500) : '';
  let citations = (Array.isArray(out.citations) ? out.citations : []).map(Number).filter((n) => valid.has(n));
  if (!citations.length)
    citations = [...answer.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])).filter((n) => valid.has(n));
  citations = [...new Set(citations)].sort((a, b) => a - b);
  const found = out.found === true && !!answer && citations.length > 0;
  return { found, answer: answer || '', citations: found ? citations : [] };
}

export async function readImage(req: ReadImageRequest): Promise<ReadImageResponse> {
  const cfg = getConfig();
  const out = (await chatJson({
    model: cfg.vision,
    system: READ_IMAGE_SYSTEM,
    user: [
      {
        type: 'text',
        text: `Read this study material.${req.languageHint && req.languageHint !== 'auto' ? ` It is probably written in language "${req.languageHint}".` : ''}`,
      },
      { type: 'image_url', image_url: { url: `data:${req.mime};base64,${req.image}` } },
    ],
    temperature: 0,
    maxTokens: 5000,
    timeoutMs: 45_000,
  })) as { text?: unknown; hasFigure?: unknown; figureDescription?: unknown; language?: unknown };
  const text = typeof out.text === 'string' ? out.text.slice(0, 20_000) : '';
  const figureDescription =
    typeof out.figureDescription === 'string' ? out.figureDescription.slice(0, 3000) : '';
  const hasFigure = out.hasFigure === true && figureDescription.length > 20;
  if (!text.trim() && !hasFigure) throw new ApiError('UNREADABLE');
  const language =
    typeof out.language === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(out.language)
      ? out.language
      : 'und';
  return { text, hasFigure, figureDescription: hasFigure ? figureDescription : '', language };
}

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

export async function transcribeAudio(req: TranscribeRequest): Promise<TranscribeResponse> {
  const cfg = getConfig();
  const audio = Buffer.from(req.audio, 'base64');
  if (audio.length < 200) throw new ApiError('UNREADABLE');
  const language = req.language && req.language !== 'auto' ? req.language.split('-')[0] : undefined;
  const res = await groqTranscribe(
    { audio, fileName: `answer.${EXT[req.mime] ?? 'webm'}`, prompt: req.prompt, language },
    [cfg.stt, ...(cfg.sttFallback ? [cfg.sttFallback] : [])],
  );
  return { text: res.text.trim().slice(0, 5000), language: normaliseLanguage(res.language) };
}

const LANGUAGE_CODES =
  'en es pt fr de it nl pl tr ru uk ar fa ur hi bn id vi ja ko zh sv da no fi cs el he th ro hu'.split(' ');

/** Whisper reports languages by English name ("english"); convert to a BCP-47 code. */
export function normaliseLanguage(value: string | undefined): string {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return 'und';
  if (/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(v) && v.length <= 3) return v;
  const names = new Intl.DisplayNames(['en'], { type: 'language' });
  return LANGUAGE_CODES.find((c) => names.of(c)?.toLowerCase() === v) ?? 'und';
}
