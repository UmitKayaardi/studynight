import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Check, Flag, X } from 'lucide-react';
import { db } from '../../db/schema';
import type { ReportReason } from '../../db/types';
import type { QuestionContent } from '../../../shared/question';
import { foldText } from '../../../shared/text';
import { api, ApiFailure } from '../../lib/api';
import { answerText, explainLevel, type AnswerInput } from '../../lib/game/check';
import { errorKey } from '../../lib/errors';
import { RichText } from '../RichText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';
import { FigureImage, useSourceLabel } from './Questions';
import { VoiceInput } from './Voice';
import type { AnswerLog, PlayItem } from '../../store/play';

/** Splits a passage so that the evidence quote (or the most similar sentence) can be highlighted. */
export function highlightEvidence(text: string, quote: string): Array<{ text: string; mark: boolean }> {
  if (!quote.trim()) return [{ text, mark: false }];
  const lower = text.toLowerCase();
  const at = lower.indexOf(quote.toLowerCase().trim());
  if (at >= 0) {
    const end = at + quote.trim().length;
    return [
      { text: text.slice(0, at), mark: false },
      { text: text.slice(at, end), mark: true },
      { text: text.slice(end), mark: false },
    ].filter((p) => p.text);
  }
  // Fuzzy: highlight the sentence that shares the most words with the quote.
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]?\s*|\n/g) ?? [text];
  const q = new Set(foldText(quote).split(' '));
  let best = -1;
  let bestScore = 0;
  sentences.forEach((s, i) => {
    const words = foldText(s).split(' ').filter(Boolean);
    const score = words.filter((w) => q.has(w)).length / Math.max(1, Math.max(words.length, q.size));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  if (bestScore < 0.3) return [{ text, mark: false }];
  return sentences.map((s, i) => ({ text: s, mark: i === best }));
}

export function SourceSheet({ open, onClose, content }: { open: boolean; onClose: () => void; content: QuestionContent }) {
  const { t } = useTranslation();
  const chunks = useLiveQuery(() => db.chunks.bulkGet(content.sourceChunkIds), [content.sourceChunkIds.join(',')]);
  const sources = useLiveQuery(() => db.sources.toArray(), []);
  return (
    <Sheet open={open} onClose={onClose} title={t('play.sourceTitle')}>
      <div className="flex flex-col gap-4 pb-3">
        <FigureImage figureId={content.figureId} />
        {chunks?.filter(Boolean).map((c) => {
          const ref = c!.refs[0];
          const src = sources?.find((s) => s.id === ref?.sourceId);
          return (
            <article key={c!.id} className="rounded-2xl bg-surface-2 p-3">
              <p className="mb-2 text-xs font-bold text-muted">
                {[src?.name || t('deck.pastedText'), ref?.slide ? t('play.slideN', { n: ref.slide }) : ref?.page ? t('play.pageN', { n: ref.page }) : null, c!.headingPath.join(' › ')]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {highlightEvidence(c!.text, content.evidenceQuote).map((p, i) =>
                  p.mark ? (
                    <mark key={i} className="rounded bg-star-soft px-0.5 text-text">
                      {p.text}
                    </mark>
                  ) : (
                    <span key={i}>{p.text}</span>
                  ),
                )}
              </p>
            </article>
          );
        })}
        {chunks && !chunks.some(Boolean) && content.evidenceQuote && (
          <article className="rounded-2xl bg-surface-2 p-3 text-sm">
            <mark className="rounded bg-star-soft px-0.5 text-text">{content.evidenceQuote}</mark>
          </article>
        )}
      </div>
    </Sheet>
  );
}

export function SourceChip({ content, onOpen }: { content: QuestionContent; onOpen: () => void }) {
  const label = useSourceLabel(content.sourceChunkIds);
  if (!label) return null;
  return (
    <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-sm font-bold">
      <BookOpen className="size-4" aria-hidden />
      {label}
    </button>
  );
}

const REASONS: ReportReason[] = ['wrong', 'notInNotes', 'unclear', 'duplicate'];

export function ReportSheet({ open, onClose, onReport }: { open: boolean; onClose: () => void; onReport: (r: ReportReason) => void }) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onClose} title={t('report.title')}>
      <p className="mb-3 text-muted">{t('report.body')}</p>
      <ul className="flex flex-col gap-2 pb-2">
        {REASONS.map((r) => (
          <li key={r}>
            <Button block variant="secondary" icon={<Flag className="size-4" aria-hidden />} onClick={() => onReport(r)}>
              {t(`report.${r}`)}
            </Button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** Explain in your own words: typed or spoken; the grader marks key points, code computes the score. */
export function ExplainView({ item, answer, onSubmit }: { item: PlayItem; answer?: AnswerLog; onSubmit: (input: AnswerInput, extra: AnswerLog['explain']) => void }) {
  const { t } = useTranslation();
  const q = item.content as Extract<QuestionContent, { type: 'explain' }>;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText('');
    setError(null);
  }, [item.id]);

  const grade = async () => {
    setBusy(true);
    setError(null);
    try {
      const chunks = (await db.chunks.bulkGet(q.sourceChunkIds.slice(0, 3))).filter(Boolean).map((c) => c!.text.slice(0, 4000));
      const res = await api.grade({
        language: item.quizLanguage && item.quizLanguage !== 'und' ? item.quizLanguage : 'auto',
        question: q.prompt,
        keyPoints: q.keyPoints,
        modelAnswer: q.modelAnswer,
        evidence: chunks.length ? chunks : [q.evidenceQuote],
        answer: text.slice(0, 2500),
      });
      onSubmit({ type: 'explain', covered: res.covered }, { text, feedback: res.feedback });
    } catch (e) {
      setError(errorKey(e instanceof ApiFailure ? e : new ApiFailure('UPSTREAM')));
    } finally {
      setBusy(false);
    }
  };

  if (answer?.input.type === 'explain') {
    const level = explainLevel(answer.score);
    return (
      <div className="flex flex-col gap-3">
        <Card className={level === 'great' ? 'border-good' : level === 'partly' ? 'border-star' : 'border-bad'}>
          <p className="font-display text-lg font-extrabold">{t(`explain.${level}`)}</p>
          <p className="text-sm text-muted">{t('explain.points', { hit: answer.input.covered.filter(Boolean).length, total: q.keyPoints.length })}</p>
        </Card>
        <ul className="flex flex-col gap-2">
          {q.keyPoints.map((k, i) => {
            const ok = answer.input.type === 'explain' && answer.input.covered[i];
            return (
              <li key={i} className="flex gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
                {ok ? <Check className="size-5 shrink-0 text-good" aria-label={t('explain.covered')} /> : <X className="size-5 shrink-0 text-bad" aria-label={t('explain.missed')} />}
                <span>
                  <RichText as="span" text={k} className="font-semibold" />
                  {!ok && answer.explain?.feedback[i] && <span className="block text-muted">{answer.explain.feedback[i]}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <details className="rounded-2xl bg-surface-2 p-3 text-sm">
          <summary className="cursor-pointer font-bold">{t('explain.modelAnswer')}</summary>
          <RichText text={q.modelAnswer} className="mt-2" />
        </details>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="explain-answer" className="sr-only">
        {t('explain.label')}
      </label>
      <textarea
        id="explain-answer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2500}
        placeholder={t('explain.placeholder')}
        className="min-h-36 rounded-2xl border-2 border-border bg-surface p-3 text-base focus:border-accent focus:outline-none"
      />
      <VoiceInput deckId={item.deckId} language={item.quizLanguage} onText={(spoken) => setText((prev) => (prev ? `${prev} ${spoken}` : spoken))} />
      {error && (
        <p className="rounded-2xl bg-bad-soft p-3 text-sm" role="alert">
          {t(`errors.${error}.body`)}
        </p>
      )}
      <Button size="lg" block busy={busy} disabled={!text.trim()} onClick={() => void grade()}>
        {busy ? t('explain.checking') : t('explain.check')}
      </Button>
    </div>
  );
}

export function FeedbackPanel({ item, answer, children, onNext, onSource }: { item: PlayItem; answer: AnswerLog; children?: ReactNode; onNext: () => void; onSource: () => void }) {
  const { t } = useTranslation();
  const q = item.content;
  const correct = answer.correct;
  const showAnswer = !correct && q.type !== 'match' && q.type !== 'order' && q.type !== 'explain' && q.type !== 'flashcard';
  return (
    <section className={`mt-4 flex flex-col gap-3 rounded-[var(--radius-card)] border-2 p-4 ${correct ? 'border-good bg-good-soft' : 'border-bad bg-bad-soft'}`} aria-labelledby="feedback-title">
      <h2 id="feedback-title" className={`flex items-center gap-2 font-display text-xl font-extrabold ${correct ? 'text-good' : 'text-bad'}`}>
        {correct ? <Check className="size-6" aria-hidden /> : <X className="size-6" aria-hidden />}
        {q.type === 'explain' ? t(`explain.${explainLevel(answer.score)}`) : correct ? t('play.correct') : t('play.incorrect')}
      </h2>
      {showAnswer && (
        <p className="text-sm">
          {t('play.answerWas')} <strong>{answerText(q, { true: t('play.true'), false: t('play.false') })}</strong>
        </p>
      )}
      {q.type === 'tf' && !q.answer && q.correction && correct && <RichText text={q.correction} className="text-sm font-semibold" />}
      {q.type !== 'explain' && <RichText text={q.explanation} className="text-sm" />}
      {children}
      <div className="flex flex-wrap items-center gap-2">
        {q.sourceChunkIds.length > 0 && <SourceChip content={q} onOpen={onSource} />}
        <span className="flex-1" />
        <Button size="lg" onClick={onNext} data-autofocus>
          {t('common.next')}
        </Button>
      </div>
    </section>
  );
}
