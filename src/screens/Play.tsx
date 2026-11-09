import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Flag, Heart, Lightbulb, Timer, X, Zap } from 'lucide-react';
import { useApp } from '../store/app';
import { BOSS_HEARTS, BOSS_SECONDS, usePlay, type PlayItem } from '../store/play';
import { Mascot } from '../components/art/Mascot';
import { StormBoss } from '../components/art/Art';
import { Button, IconButton } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/Controls';
import { ConfirmSheet } from '../components/ui/Sheet';
import { FigureImage, FillView, FlashcardView, GradeButtons, MatchView, McqView, OrderView, Prompt, TfView, timeoutInput } from '../components/play/Questions';
import { ExplainView, FeedbackPanel, ReportSheet, SourceSheet } from '../components/play/Feedback';
import { RichText } from '../components/RichText';
import type { AnswerInput } from '../lib/game/check';
import { answerText } from '../lib/game/check';
import { play as sound } from '../lib/sound';
import { formatNumber, haptic, reducedMotion } from '../lib/platform';
import { ensureFontForLanguage } from '../i18n/fonts';
import type { SelfGrade } from '../lib/learning/fsrs';
import { useDocumentDir } from '../lib/useDir';

function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : null;
}

export default function Play() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const s = usePlay();
  const extendedTime = useApp((x) => x.settings.extendedTime);
  const toast = useApp((x) => x.toast);
  const [sheet, setSheet] = useState<'source' | 'report' | 'quit' | null>(null);
  const [announce, setAnnounce] = useState('');
  const [questionDeadline, setQuestionDeadline] = useState<number | null>(null);
  const item = s.items[s.index];
  const answer = item ? s.answers.find((a) => a.itemId === item.id && !a.reported) : undefined;
  const mode = s.config?.mode;

  useEffect(() => {
    if (!s.config) navigate('/', { replace: true });
  }, [s.config, navigate]);
  useEffect(() => {
    if (s.phase === 'done') navigate('/results', { replace: true });
  }, [s.phase, navigate]);
  useEffect(() => {
    if (item?.quizLanguage) ensureFontForLanguage(item.quizLanguage);
  }, [item?.quizLanguage]);

  // Boss battle: a timer per question (extended-time option gives 50 % more).
  useEffect(() => {
    if (mode === 'boss' && s.phase === 'question') setQuestionDeadline(Date.now() + BOSS_SECONDS * (extendedTime ? 1.5 : 1) * 1000);
    else setQuestionDeadline(null);
  }, [mode, s.phase, s.index, extendedTime]);
  const questionLeft = useCountdown(questionDeadline);
  const examLeft = useCountdown(s.deadline);

  const submit = async (input: AnswerInput, extra?: Parameters<typeof s.submit>[1]) => {
    const log = await s.submit(input, extra);
    if (!log || mode === 'exam' || mode === 'flashcards') return;
    sound(log.correct ? (mode === 'boss' ? 'bossHit' : 'correct') : 'wrong');
    haptic(log.correct ? 'correct' : 'wrong');
    setAnnounce(log.correct ? t('play.correct') : t('play.incorrectAnnounce', { answer: answerText(item!.content, { true: t('play.true'), false: t('play.false') }) }));
    const st = usePlay.getState();
    if (st.comboMilestone) {
      sound('combo');
      haptic('celebrate');
    }
  };

  useEffect(() => {
    if (questionLeft === 0 && item && s.phase === 'question' && !answer) void submit(timeoutInput(item.content));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionLeft]);
  useEffect(() => {
    if (examLeft === 0 && s.phase !== 'done') void s.finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examLeft]);

  if (!s.config) return null;
  if (s.phase === 'loading') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <Mascot mood="thinking" size={130} />
        <p className="text-lg" aria-live="polite">
          {t('play.preparing')}
        </p>
      </main>
    );
  }
  if (s.phase === 'empty') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <Mascot mood="sleepy" size={130} />
        <h1 className="font-display text-2xl font-extrabold">{mode === 'review' ? t('play.nothingDue') : t('play.noQuestions')}</h1>
        <p className="text-muted">{mode === 'review' ? t('play.nothingDueBody') : t('play.noQuestionsBody')}</p>
        <Button onClick={() => navigate(s.config && 'deckId' in s.config && s.config.deckId ? `/deck/${s.config.deckId}` : '/')}>{t('common.back')}</Button>
      </main>
    );
  }
  if (!item) return null;

  const correctSoFar = s.answers.filter((a) => a.correct && !a.reported).length;
  const progress = mode === 'boss' ? correctSoFar / s.items.length : (s.index + (answer ? 1 : 0)) / s.items.length;
  const canHint = mode !== 'exam' && mode !== 'boss' && mode !== 'challenge' && s.phase === 'question' && !s.hintUsed && !!item.content.hint;
  const leave = () => {
    const deckId = s.config && 'deckId' in s.config ? s.config.deckId : undefined;
    if (s.answers.length) void s.finish();
    else navigate(deckId ? `/deck/${deckId}` : '/');
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]" onPointerDown={s.touch} onKeyDown={s.touch}>
      <p className="sr-only" aria-live="assertive">
        {announce}
      </p>
      <header className="flex items-center gap-2 py-2">
        <IconButton label={t('play.quit')} onClick={() => setSheet('quit')}>
          <X className="size-6" aria-hidden />
        </IconButton>
        <div className="flex-1">
          <ProgressBar value={progress} label={t('play.progress', { n: s.index + 1, total: s.items.length })} />
        </div>
        {mode === 'boss' ? (
          <span className="flex items-center gap-0.5" aria-label={t('play.hearts', { count: s.hearts })} role="img">
            {Array.from({ length: BOSS_HEARTS }, (_, i) => (
              <Heart key={i} className={`size-5 ${i < s.hearts ? 'fill-bad text-bad' : 'text-muted'}`} aria-hidden />
            ))}
          </span>
        ) : mode === 'exam' && examLeft !== null ? (
          <span className="inline-flex items-center gap-1 font-display font-extrabold tabular-nums" role="timer" aria-label={t('play.timeLeft', { time: formatClock(examLeft) })}>
            <Timer className="size-5" aria-hidden />
            {formatClock(examLeft)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-display font-extrabold" aria-label={t('play.xpTotal', { xp: s.xp })}>
            <Zap className="size-5 fill-star text-star-text" aria-hidden />
            {formatNumber(s.xp)}
          </span>
        )}
      </header>

      {mode === 'boss' && (
        <div className="flex items-center justify-center gap-3">
          <StormBoss hit={!!answer?.correct && !reducedMotion()} defeated={correctSoFar >= s.items.length} size={110} />
          {questionLeft !== null && (
            <span className={`font-display text-2xl font-extrabold tabular-nums ${questionLeft < 8000 ? 'text-bad' : ''}`} role="timer" aria-label={t('play.secondsLeft', { count: Math.ceil(questionLeft / 1000) })}>
              {formatNumber(Math.ceil(questionLeft / 1000))}
            </span>
          )}
        </div>
      )}

      <AnimatePresence>
        {s.combo >= 3 && mode !== 'exam' && (
          <motion.p
            key={`combo-${s.combo}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mx-auto mb-1 rounded-full bg-star px-3 py-1 font-display text-sm font-extrabold text-[#2b1d00]"
          >
            {t('play.combo', { count: s.combo })}
          </motion.p>
        )}
      </AnimatePresence>

      <main className="flex flex-1 flex-col gap-4 py-2">
        {mode === 'flashcards' ? (
          <SwipeCard key={item.id} item={item} onGrade={(g) => void submit({ type: 'flashcard', grade: g })} />
        ) : (
          <>
            <div lang={item.quizLanguage !== 'auto' && item.quizLanguage !== 'und' ? item.quizLanguage : undefined} dir="auto">
              <FigureImage figureId={item.content.figureId} />
              <Prompt q={item.content} />
            </div>
            {s.hintUsed && item.content.hint && (
              <p className="flex gap-2 rounded-2xl bg-star-soft p-3 text-sm">
                <Lightbulb className="size-5 shrink-0" aria-hidden />
                <RichText as="span" text={item.content.hint} />
              </p>
            )}
            <div lang={item.quizLanguage !== 'auto' && item.quizLanguage !== 'und' ? item.quizLanguage : undefined}>
              <QuestionBody item={item} answer={answer} hideResult={mode === 'exam'} onSubmit={(i, x) => void submit(i, x)} />
            </div>
            {answer && s.phase === 'feedback' && (
              <>
                <AnimatePresence>
                  {s.lastXp > 0 && (
                    <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="self-center font-display text-lg font-extrabold text-star-text">
                      {t('play.xpGain', { xp: s.lastXp })}
                    </motion.p>
                  )}
                </AnimatePresence>
                {mode === 'boss' && answer.correct && <p className="text-center font-display font-extrabold text-accent">{t('play.bossHit')}</p>}
                <FeedbackPanel item={item} answer={answer} onNext={() => void s.next()} onSource={() => setSheet('source')} />
              </>
            )}
          </>
        )}
      </main>

      <footer className="flex items-center justify-between gap-2">
        {canHint ? (
          <Button variant="ghost" size="sm" icon={<Lightbulb className="size-5" aria-hidden />} onClick={s.useHint}>
            {t('play.hint')}
          </Button>
        ) : (
          <span />
        )}
        {mode !== 'challenge' && (
          <IconButton label={t('report.open')} onClick={() => setSheet('report')}>
            <Flag className="size-5" aria-hidden />
          </IconButton>
        )}
      </footer>

      <SourceSheet open={sheet === 'source'} onClose={() => setSheet(null)} content={item.content} />
      <ReportSheet
        open={sheet === 'report'}
        onClose={() => setSheet(null)}
        onReport={async (reason) => {
          setSheet(null);
          const r = await s.report(reason);
          if (r) toast({ message: t('report.done'), action: { label: t('common.undo'), run: () => void r.undo() } });
        }}
      />
      <ConfirmSheet
        open={sheet === 'quit'}
        title={t('play.quitTitle')}
        body={t('play.quitBody')}
        confirmLabel={t('play.quitConfirm')}
        onClose={() => setSheet(null)}
        onConfirm={() => {
          setSheet(null);
          leave();
        }}
      />
    </div>
  );
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${formatNumber(m)}:${formatNumber(sec, { minimumIntegerDigits: 2 })}`;
}

function QuestionBody({ item, answer, onSubmit, hideResult }: { item: PlayItem; answer?: ReturnType<typeof usePlay.getState>['answers'][number]; onSubmit: (i: AnswerInput, extra?: { text: string; feedback: string[] }) => void; hideResult: boolean }) {
  const props = { item, answer, onSubmit: (i: AnswerInput) => onSubmit(i), hideResult };
  switch (item.content.type) {
    case 'mcq':
      return <McqView {...props} />;
    case 'tf':
      return <TfView {...props} />;
    case 'fill':
      return <FillView {...props} />;
    case 'flashcard':
      return <FlashcardView {...props} />;
    case 'match':
      return <MatchView {...props} />;
    case 'order':
      return <OrderView {...props} />;
    case 'explain':
      return <ExplainView item={item} answer={answer} onSubmit={(i, x) => onSubmit(i, x)} />;
  }
}

/** Flashcards mode: swipe right = got it, left = again, up = easy (mirrored in right-to-left languages), or use the buttons. */
function SwipeCard({ item, onGrade }: { item: PlayItem; onGrade: (g: SelfGrade) => void }) {
  const { t } = useTranslation();
  const dir = useDocumentDir();
  const [flipped, setFlipped] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const ref = useRef<HTMLDivElement>(null);
  const q = item.content;
  const back = answerText(q, { true: t('play.true'), false: t('play.false') });
  const front = q.type === 'fill' ? q.prompt.replace('____', '＿＿＿＿') : q.prompt;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dx = dir === 'rtl' ? -info.offset.x : info.offset.x;
    if (info.offset.y < -120) onGrade('easy');
    else if (dx > 120) onGrade('good');
    else if (dx < -120) onGrade('again');
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <motion.div
        ref={ref}
        drag={flipped}
        dragSnapToOrigin
        style={{ x, rotate }}
        onDragEnd={onDragEnd}
        className="flex min-h-72 flex-1 cursor-grab touch-none flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center shadow-card"
      >
        <RichText text={front} className="font-display text-xl font-bold" />
        {flipped ? (
          <RichText text={back} className="border-t border-border pt-3 text-lg" />
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              setFlipped(true);
              sound('flip');
            }}
          >
            {t('play.showAnswer')}
          </Button>
        )}
      </motion.div>
      {flipped && (
        <>
          <p className="text-center text-sm text-muted">{t('play.swipeHelp')}</p>
          <GradeButtons onGrade={onGrade} />
        </>
      )}
    </div>
  );
}
