/** Question views for every type. Tap targets ≥ 44 px; colour is never the only signal (icons + text). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Reorder } from 'framer-motion';
import { ArrowDown, ArrowUp, Check, GripVertical, RotateCcw, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { QuestionContent } from '../../../shared/question';
import type { AnswerInput } from '../../lib/game/check';
import type { SelfGrade } from '../../lib/learning/fsrs';
import { db } from '../../db/schema';
import { play as sound } from '../../lib/sound';
import { RichText } from '../RichText';
import { Button } from '../ui/Button';
import type { AnswerLog, PlayItem } from '../../store/play';

export interface QuestionProps {
  item: PlayItem;
  answer?: AnswerLog;
  onSubmit: (input: AnswerInput) => void;
  /** Exam mode: no correctness shown. */
  hideResult?: boolean;
}

const LETTERS = ['A', 'B', 'C', 'D'];

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-good">
      <Check className="size-5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-bad">
      <X className="size-5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FigureImage({ figureId }: { figureId?: string }) {
  const { t } = useTranslation();
  const image = useLiveQuery(() => (figureId ? db.images.get(figureId) : undefined), [figureId]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image?.blob) return;
    const u = URL.createObjectURL(image.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);
  if (!figureId || !url) return null;
  return (
    <img
      src={url}
      alt={t('play.figureAlt')}
      className="mb-3 max-h-64 w-full rounded-2xl border border-border bg-white object-contain"
    />
  );
}

export function Prompt({ q }: { q: QuestionContent }) {
  const text = q.type === 'fill' ? q.prompt.replace('____', '＿＿＿＿') : q.prompt;
  return (
    <h2 data-testid="prompt" className="font-display text-xl leading-snug font-bold sm:text-2xl">
      <RichText as="span" text={text} />
    </h2>
  );
}

export function McqView({ item, answer, onSubmit, hideResult }: QuestionProps) {
  const { t } = useTranslation();
  const q = item.content as Extract<QuestionContent, { type: 'mcq' }>;
  const chosen = answer?.input.type === 'mcq' ? answer.input.choice : null;
  return (
    <ul className="flex flex-col gap-2" role="list">
      {item.order.map((orig, pos) => {
        const isCorrect = orig === q.answerIndex;
        const show = answer && !hideResult;
        const state = show
          ? isCorrect
            ? 'good'
            : chosen === orig
              ? 'bad'
              : 'idle'
          : chosen === orig
            ? 'chosen'
            : 'idle';
        return (
          <li key={orig}>
            <button
              type="button"
              disabled={!!answer}
              onClick={() => onSubmit({ type: 'mcq', choice: orig })}
              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-start text-lg transition active:scale-[0.99] ${
                state === 'good'
                  ? 'border-good bg-good-soft'
                  : state === 'bad'
                    ? 'border-bad bg-bad-soft'
                    : state === 'chosen'
                      ? 'border-accent bg-accent-soft'
                      : 'border-border bg-surface hover:border-accent'
              }`}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-sm font-extrabold"
                aria-hidden
              >
                {LETTERS[pos]}
              </span>
              <RichText as="span" text={q.options[orig]!} className="min-w-0 flex-1" />
              {state === 'good' && <Mark ok label={t('play.correctAnswer')} />}
              {state === 'bad' && <Mark ok={false} label={t('play.yourAnswer')} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function TfView({ answer, onSubmit, item, hideResult }: QuestionProps) {
  const { t } = useTranslation();
  const q = item.content as Extract<QuestionContent, { type: 'tf' }>;
  const chosen = answer?.input.type === 'tf' ? answer.input.value : null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {[true, false].map((v) => {
        const show = answer && !hideResult;
        const state = show
          ? v === q.answer
            ? 'good'
            : chosen === v
              ? 'bad'
              : 'idle'
          : chosen === v
            ? 'chosen'
            : 'idle';
        return (
          <button
            key={String(v)}
            type="button"
            disabled={!!answer}
            onClick={() => onSubmit({ type: 'tf', value: v })}
            className={`flex min-h-20 items-center justify-center gap-2 rounded-2xl border-2 font-display text-xl font-extrabold transition active:scale-[0.98] ${
              state === 'good'
                ? 'border-good bg-good-soft'
                : state === 'bad'
                  ? 'border-bad bg-bad-soft'
                  : state === 'chosen'
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface hover:border-accent'
            }`}
          >
            {v ? t('play.true') : t('play.false')}
            {state === 'good' && <Mark ok label={t('play.correctAnswer')} />}
            {state === 'bad' && <Mark ok={false} label={t('play.yourAnswer')} />}
          </button>
        );
      })}
    </div>
  );
}

export function FillView({ answer, onSubmit, hideResult, item }: QuestionProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const q = item.content as Extract<QuestionContent, { type: 'fill' }>;
  useEffect(() => {
    setText('');
    ref.current?.focus();
  }, [item.id]);
  const show = answer && !hideResult;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !answer) onSubmit({ type: 'fill', text });
      }}
    >
      <label htmlFor="fill-answer" className="sr-only">
        {t('play.typeAnswer')}
      </label>
      <input
        id="fill-answer"
        ref={ref}
        value={answer?.input.type === 'fill' ? answer.input.text : text}
        onChange={(e) => setText(e.target.value)}
        disabled={!!answer}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={t('play.typeAnswer')}
        className={`min-h-14 rounded-2xl border-2 bg-surface px-4 text-lg focus:outline-none ${show ? (answer.correct ? 'border-good' : 'border-bad') : 'border-border focus:border-accent'}`}
      />
      {show && !answer.correct && (
        <p className="text-sm">
          {t('play.expected')} <strong>{q.answer}</strong>
        </p>
      )}
      {show && answer.evaluation.typoAccepted && (
        <p className="text-sm text-muted">{t('play.typoAccepted', { answer: q.answer })}</p>
      )}
      {!answer && (
        <Button type="submit" size="lg" block disabled={!text.trim()}>
          {t('play.check')}
        </Button>
      )}
    </form>
  );
}

export function GradeButtons({ onGrade, disabled }: { onGrade: (g: SelfGrade) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const grades: Array<{ g: SelfGrade; cls: string }> = [
    { g: 'again', cls: 'border-bad' },
    { g: 'hard', cls: 'border-star' },
    { g: 'good', cls: 'border-accent' },
    { g: 'easy', cls: 'border-good' },
  ];
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('play.howWell')}>
      {grades.map(({ g, cls }) => (
        <button
          key={g}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(g)}
          className={`min-h-14 rounded-2xl border-2 bg-surface px-1 font-display text-sm font-extrabold ${cls}`}
        >
          {t(`play.grade.${g}`)}
        </button>
      ))}
    </div>
  );
}

export function FlashcardView({ item, answer, onSubmit }: QuestionProps) {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);
  const q = item.content as Extract<QuestionContent, { type: 'flashcard' }>;
  useEffect(() => {
    setFlipped(false);
  }, [item.id]);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          setFlipped(true);
          sound('flip');
        }}
        aria-expanded={flipped}
        className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-accent bg-accent-soft p-5 text-center"
      >
        {flipped ? (
          <RichText text={q.back} className="text-lg" />
        ) : (
          <span className="font-display font-extrabold">{t('play.showAnswer')}</span>
        )}
      </button>
      {flipped && !answer && <GradeButtons onGrade={(g) => onSubmit({ type: 'flashcard', grade: g })} />}
    </div>
  );
}

const PAIR_COLOURS = ['#2ee6c5', '#ffc94d', '#c3b2ff', '#ff9fc1', '#8fd3ff'];

export function MatchView({ item, answer, onSubmit, hideResult }: QuestionProps) {
  const { t } = useTranslation();
  const q = item.content as Extract<QuestionContent, { type: 'match' }>;
  const [pairs, setPairs] = useState<Array<number | null>>(() => q.pairs.map(() => null));
  const [activeTerm, setActiveTerm] = useState<number | null>(null);
  useEffect(() => {
    setPairs(q.pairs.map(() => null));
    setActiveTerm(null);
  }, [item.id, q.pairs]);
  const done = answer?.input.type === 'match' ? answer.input.pairs : null;
  const shown = done ?? pairs;
  const defOwner = (d: number) => shown.findIndex((x) => x === d);

  const chooseDef = (d: number) => {
    if (answer || activeTerm === null) return;
    const next = shown.map((x) => (x === d ? null : x));
    next[activeTerm] = d;
    setPairs(next);
    const free = next.findIndex((x) => x === null);
    setActiveTerm(free === -1 ? null : free);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted" id="match-help">
        {t('play.matchHelp')}
      </p>
      <div className="grid grid-cols-2 gap-2" aria-describedby="match-help">
        <ul className="flex flex-col gap-2" aria-label={t('play.terms')}>
          {q.pairs.map((p, i) => {
            const d = shown[i];
            const colour = d !== null && d !== undefined ? PAIR_COLOURS[i % PAIR_COLOURS.length] : undefined;
            const ok = done && !hideResult ? done[i] === i : null;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={!!answer}
                  aria-pressed={activeTerm === i}
                  onClick={() => setActiveTerm(i)}
                  className={`flex min-h-14 w-full items-center gap-2 rounded-2xl border-2 p-2 text-start text-sm ${activeTerm === i ? 'border-accent bg-accent-soft' : 'border-border bg-surface'}`}
                >
                  {colour && (
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full font-display text-xs font-extrabold text-[#141a3a]"
                      style={{ background: colour }}
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                  )}
                  <RichText as="span" text={p.term} className="min-w-0 flex-1 font-semibold" />
                  {ok !== null && (
                    <Mark ok={ok} label={ok ? t('play.correctAnswer') : t('play.yourAnswer')} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="flex flex-col gap-2" aria-label={t('play.definitions')}>
          {item.order.map((d) => {
            const owner = defOwner(d);
            const colour = owner >= 0 ? PAIR_COLOURS[owner % PAIR_COLOURS.length] : undefined;
            return (
              <li key={d}>
                <button
                  type="button"
                  disabled={!!answer || activeTerm === null}
                  onClick={() => chooseDef(d)}
                  className="flex min-h-14 w-full items-center gap-2 rounded-2xl border-2 border-border bg-surface p-2 text-start text-sm disabled:opacity-100"
                  style={colour ? { borderColor: colour } : undefined}
                >
                  {colour && (
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full font-display text-xs font-extrabold text-[#141a3a]"
                      style={{ background: colour }}
                      aria-hidden
                    >
                      {owner + 1}
                    </span>
                  )}
                  <RichText as="span" text={q.pairs[d]!.definition} className="min-w-0 flex-1" />
                  {owner >= 0 && <span className="sr-only">{t('play.pairedWith', { n: owner + 1 })}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {done && !hideResult && !answer?.correct && (
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="mb-1 font-bold">{t('play.correctPairs')}</p>
          <ul>
            {q.pairs.map((p, i) => (
              <li key={i}>
                {p.term} → {p.definition}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!answer && (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            icon={<RotateCcw className="size-4" aria-hidden />}
            onClick={() => setPairs(q.pairs.map(() => null))}
          >
            {t('play.reset')}
          </Button>
          <Button
            block
            disabled={pairs.some((x) => x === null)}
            onClick={() => onSubmit({ type: 'match', pairs: pairs as number[] })}
          >
            {t('play.check')}
          </Button>
        </div>
      )}
    </div>
  );
}

export function OrderView({ item, answer, onSubmit, hideResult }: QuestionProps) {
  const { t } = useTranslation();
  const q = item.content as Extract<QuestionContent, { type: 'order' }>;
  const [order, setOrder] = useState<number[]>(item.order);
  useEffect(() => {
    setOrder(item.order);
  }, [item.id, item.order]);
  const done = answer?.input.type === 'order' ? answer.input.order : null;
  const shown = done ?? order;
  const move = (pos: number, delta: number) => {
    const next = order.slice();
    const to = pos + delta;
    if (to < 0 || to >= next.length) return;
    [next[pos], next[to]] = [next[to]!, next[pos]!];
    setOrder(next);
  };
  const row = (s: number, pos: number) => {
    const ok = done && !hideResult ? s === pos : null;
    return (
      <div
        className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 bg-surface p-2 ${ok === null ? 'border-border' : ok ? 'border-good' : 'border-bad'}`}
      >
        {!answer && <GripVertical className="size-5 shrink-0 cursor-grab text-muted" aria-hidden />}
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-sm font-extrabold"
          aria-hidden
        >
          {pos + 1}
        </span>
        <RichText as="span" text={q.steps[s]!} className="min-w-0 flex-1 text-sm font-semibold" />
        {ok !== null && <Mark ok={ok} label={ok ? t('play.correctAnswer') : t('play.yourAnswer')} />}
        {!answer && (
          <span className="flex shrink-0 flex-col">
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-xl hover:bg-surface-2 disabled:opacity-30"
              disabled={pos === 0}
              onClick={() => move(pos, -1)}
              aria-label={t('play.moveUp', { n: pos + 1 })}
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-xl hover:bg-surface-2 disabled:opacity-30"
              disabled={pos === order.length - 1}
              onClick={() => move(pos, 1)}
              aria-label={t('play.moveDown', { n: pos + 1 })}
            >
              <ArrowDown className="size-4" aria-hidden />
            </button>
          </span>
        )}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('play.orderHelp')}</p>
      {answer ? (
        <ol className="flex flex-col gap-2">
          {shown.map((s, pos) => (
            <li key={s}>{row(s, pos)}</li>
          ))}
        </ol>
      ) : (
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className="flex flex-col gap-2" as="ol">
          {order.map((s, pos) => (
            <Reorder.Item key={s} value={s} as="li">
              {row(s, pos)}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}
      {done && !hideResult && !answer?.correct && (
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="mb-1 font-bold">{t('play.correctOrder')}</p>
          <ol className="list-decimal ps-5">
            {q.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      {!answer && (
        <Button block size="lg" onClick={() => onSubmit({ type: 'order', order })}>
          {t('play.check')}
        </Button>
      )}
    </div>
  );
}

/** A deliberately wrong input used when a timer runs out. */
export function timeoutInput(q: QuestionContent): AnswerInput {
  switch (q.type) {
    case 'mcq':
      return { type: 'mcq', choice: -1 };
    case 'tf':
      return { type: 'tf', value: !q.answer };
    case 'fill':
      return { type: 'fill', text: '' };
    case 'flashcard':
      return { type: 'flashcard', grade: 'again' };
    case 'match':
      return { type: 'match', pairs: q.pairs.map(() => -1) };
    case 'order':
      return { type: 'order', order: q.steps.map(() => -1) };
    case 'explain':
      return { type: 'explain', covered: q.keyPoints.map(() => false) };
  }
}

export function useSourceLabel(sourceChunkIds: string[]): string | null {
  const { t } = useTranslation();
  const data = useLiveQuery(async () => {
    const chunk = sourceChunkIds[0] ? await db.chunks.get(sourceChunkIds[0]) : undefined;
    if (!chunk) return null;
    const ref = chunk.refs[0];
    const source = ref ? await db.sources.get(ref.sourceId) : undefined;
    return { ref, kind: source?.kind };
  }, [sourceChunkIds.join(',')]);
  return useMemo(() => {
    if (!data) return null;
    if (data.ref?.slide) return t('play.fromSlide', { n: data.ref.slide });
    if (data.ref?.page) return t('play.fromPage', { n: data.ref.page });
    return t('play.fromNotes');
  }, [data, t]);
}
