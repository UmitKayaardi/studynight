import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Brain,
  FileText,
  GraduationCap,
  Layers,
  MessageCircleQuestion,
  RefreshCw,
  Send,
  Settings2,
  Skull,
  Swords,
  Zap,
} from 'lucide-react';
import { db } from '../db/schema';
import { deleteDeck, restoreDeck, updateDeck, upsertExam } from '../db/repo';
import { SubScreen } from '../components/layout/Shell';
import { Button, IconButton } from '../components/ui/Button';
import { Card, Chip, Ring, Segmented, SelectField, TextField } from '../components/ui/Controls';
import { ConfirmSheet, Sheet } from '../components/ui/Sheet';
import { Mascot } from '../components/art/Mascot';
import { SmartSearchCard } from '../components/SmartSearch';
import { useApp } from '../store/app';
import { usePlay, type SessionConfig } from '../store/play';
import { deckStats, type TopicStat } from '../lib/deck/stats';
import { ensureTopicQuestions, startBackgroundGeneration, useGeneration } from '../lib/deck/generate';
import { forgetDeckIndex } from '../lib/search/retrieve';
import { LANGUAGES } from '../i18n';
import { dayKey } from '../lib/learning/streak';
import { formatNumber, languageDisplayName } from '../lib/platform';
import { BOSS_UNLOCK } from '../lib/learning/mastery';
import { ErrorCard } from './NewDeck';
import type { ErrorKey } from '../lib/errors';

export default function DeckScreen() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const start = usePlay((s) => s.start);
  const extendedTime = useApp((s) => s.settings.extendedTime);
  const generating = useGeneration((s) => s.running[id]);
  const waiting = useGeneration((s) => s.waiting[id]);
  const stats = useLiveQuery(() => deckStats(id), [id]);
  const sources = useLiveQuery(() => db.sources.where('deckId').equals(id).toArray(), [id]);
  const [sheet, setSheet] = useState<'settings' | 'boss' | 'exam' | 'topic' | null>(null);
  const [topicChoice, setTopicChoice] = useState<TopicStat | null>(null);

  useEffect(() => {
    if (stats?.deck.status === 'ready' && navigator.onLine) startBackgroundGeneration(id);
  }, [id, stats?.deck.status]);

  if (stats === undefined) return null;
  if (stats === null) {
    return (
      <SubScreen title={t('deck.missing')} back="/decks">
        <Card className="mt-4 flex flex-col items-center gap-3 text-center">
          <Mascot mood="surprised" size={110} />
          <p>{t('deck.missingBody')}</p>
          <Button onClick={() => navigate('/decks')}>{t('nav.decks')}</Button>
        </Card>
      </SubScreen>
    );
  }
  const { deck, topics, mastery, questions, due } = stats;
  const play = (config: SessionConfig) => {
    void start(config);
    navigate('/play');
  };
  const bossTopics = topics.filter((x) => x.bossUnlocked);

  if (deck.status !== 'ready') {
    return (
      <SubScreen title={deck.title} back="/decks">
        <div className="mt-4 flex flex-col gap-3">
          <ErrorCard code={(deck.errorCode as ErrorKey) ?? 'UNKNOWN'} />
          <DeleteDeckButton deckId={deck.id} title={deck.title} />
        </div>
      </SubScreen>
    );
  }

  return (
    <SubScreen
      title={deck.title}
      back="/decks"
      actions={
        <IconButton label={t('deck.settings')} onClick={() => setSheet('settings')}>
          <Settings2 className="size-6" aria-hidden />
        </IconButton>
      }
    >
      <section className="flex items-center gap-4 py-2">
        <Ring value={mastery / 100} size={72} stroke={8} label={t('deck.masteryLabel', { percent: mastery })}>
          {t('deck.percent', { value: formatNumber(mastery) })}
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{`${t('decks.topicCount', { count: topics.length })} · ${t('decks.questionCount', { count: questions })}`}</p>
          <p className="text-sm text-muted">
            {t('deck.quizIn', {
              language: languageDisplayName(
                deck.quizLanguage === 'auto' ? deck.notesLanguage : deck.quizLanguage,
              ),
            })}
          </p>
          {(generating || waiting) && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-accent" aria-live="polite">
              <RefreshCw className="size-4 animate-spin" aria-hidden />
              {waiting ? t('deck.busy') : t('deck.generating')}
            </p>
          )}
        </div>
      </section>
      {waiting && (
        <p className="mb-2 rounded-2xl bg-star-soft p-3 text-sm">{t('errors.RATE_LIMITED.body')}</p>
      )}

      <SmartSearchCard deckId={deck.id} />

      <section aria-label={t('deck.modes')} className="mt-2 grid grid-cols-2 gap-2">
        <ModeButton
          icon={<Zap />}
          label={t('modes.quick')}
          hint={t('modes.quickHint')}
          onClick={() => play({ mode: 'quick', deckId: deck.id })}
          primary
        />
        <ModeButton
          icon={<RefreshCw />}
          label={t('modes.review')}
          hint={t('decks.due', { count: due })}
          onClick={() => play({ mode: 'review', deckId: deck.id })}
          disabled={!due}
        />
        <ModeButton
          icon={<Brain />}
          label={t('modes.topic')}
          hint={t('modes.topicHint')}
          onClick={() => setSheet('topic')}
        />
        <ModeButton
          icon={<Swords />}
          label={t('modes.boss')}
          hint={
            bossTopics.length
              ? t('modes.bossHint', { count: bossTopics.length })
              : t('modes.bossLocked', { percent: BOSS_UNLOCK })
          }
          onClick={() => setSheet('boss')}
          disabled={!bossTopics.length}
        />
        <ModeButton
          icon={<GraduationCap />}
          label={t('modes.exam')}
          hint={t('modes.examHint')}
          onClick={() => setSheet('exam')}
        />
        <ModeButton
          icon={<Skull />}
          label={t('modes.sudden')}
          hint={t('modes.suddenBest', { count: deck.bestSuddenDeath })}
          onClick={() => play({ mode: 'sudden', deckId: deck.id })}
        />
        <ModeButton
          icon={<Layers />}
          label={t('modes.flashcards')}
          hint={t('modes.flashcardsHint')}
          onClick={() => play({ mode: 'flashcards', deckId: deck.id })}
        />
        <ModeButton
          icon={<MessageCircleQuestion />}
          label={t('modes.ask')}
          hint={t('modes.askHint')}
          onClick={() => navigate(`/deck/${deck.id}/ask`)}
        />
        <ModeButton
          icon={<Send />}
          label={t('modes.challenge')}
          hint={t('modes.challengeHint')}
          onClick={() => {
            sessionStorage.setItem('sn-challenge-intent', deck.id);
            play({ mode: 'quick', deckId: deck.id });
          }}
        />
      </section>

      <p className="mt-3 flex items-start gap-2 text-xs text-muted">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {t('deck.aiDisclaimer')}
      </p>

      <h2 className="mt-5 mb-2 font-display text-xl font-extrabold">{t('deck.topicMap')}</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {topics.map((ts) => (
          <li key={ts.topic.id}>
            <button
              type="button"
              onClick={() => {
                setTopicChoice(ts);
                setSheet('topic');
              }}
              className={`flex w-full items-center gap-3 rounded-[var(--radius-card)] border bg-surface p-3 text-start shadow-card transition hover:border-accent ${ts.weak ? 'border-bad' : 'border-border'}`}
            >
              <Ring
                value={ts.mastery / 100}
                size={48}
                label={t('deck.masteryLabel', { percent: ts.mastery })}
                color={ts.weak ? 'var(--sn-bad)' : undefined}
              >
                {formatNumber(ts.mastery)}
              </Ring>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-extrabold leading-snug">{ts.topic.title}</span>
                <span className="block text-xs text-muted">
                  {t('deck.topicQuestions', { count: ts.questions })}
                </span>
              </span>
              {ts.weak && <Chip tone="bad">{t('deck.weak')}</Chip>}
              {ts.bossUnlocked && (
                <Swords className="size-5 text-star-text" aria-label={t('modes.bossReady')} />
              )}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mt-5 mb-2 font-display text-xl font-extrabold">{t('deck.sources')}</h2>
      <ul className="flex flex-col gap-1">
        {sources?.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{s.name || t('deck.pastedText')}</span>
            {s.units > 1 && (
              <span className="text-muted">
                {t(s.kind === 'pptx' ? 'deck.slides' : 'deck.pages', { count: s.units })}
              </span>
            )}
          </li>
        ))}
      </ul>

      <TopicSheet
        open={sheet === 'topic'}
        onClose={() => {
          setSheet(null);
          setTopicChoice(null);
        }}
        topics={topics}
        chosen={topicChoice}
        onPractise={(topicId) => play({ mode: 'topic', deckId: deck.id, topicId })}
        onBoss={(topicId) => play({ mode: 'boss', deckId: deck.id, topicId })}
      />
      <Sheet open={sheet === 'boss'} onClose={() => setSheet(null)} title={t('modes.boss')}>
        <p className="mb-3 text-muted">{t('modes.bossIntro', { seconds: extendedTime ? 45 : 30 })}</p>
        <ul className="flex flex-col gap-2 pb-2">
          {bossTopics.map((ts) => (
            <li key={ts.topic.id}>
              <Button
                block
                variant="secondary"
                icon={<Swords className="size-5" aria-hidden />}
                onClick={() => play({ mode: 'boss', deckId: deck.id, topicId: ts.topic.id })}
              >
                {ts.topic.title}
              </Button>
            </li>
          ))}
        </ul>
      </Sheet>
      <ExamSheet
        open={sheet === 'exam'}
        onClose={() => setSheet(null)}
        extended={extendedTime}
        onStart={(count, minutes) => play({ mode: 'exam', deckId: deck.id, count, minutes })}
      />
      <DeckSettings open={sheet === 'settings'} onClose={() => setSheet(null)} stats={stats} />
    </SubScreen>
  );
}

function ModeButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-20 flex-col items-start gap-1 rounded-[var(--radius-card)] border p-3 text-start shadow-card transition active:scale-[0.98] disabled:opacity-50 [&_svg]:size-6 ${primary ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface'}`}
    >
      <span aria-hidden>{icon}</span>
      <span className="font-display font-extrabold leading-tight">{label}</span>
      <span className={`text-xs ${primary ? '' : 'text-muted'}`}>{hint}</span>
    </button>
  );
}

function TopicSheet({
  open,
  onClose,
  topics,
  chosen,
  onPractise,
  onBoss,
}: {
  open: boolean;
  onClose: () => void;
  topics: TopicStat[];
  chosen: TopicStat | null;
  onPractise: (id: string) => void;
  onBoss: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onClose} title={chosen ? chosen.topic.title : t('modes.topic')}>
      {chosen ? (
        <div className="flex flex-col gap-3 pb-2">
          {chosen.topic.summary && <p className="text-muted">{chosen.topic.summary}</p>}
          <p className="text-sm">
            {t('deck.topicStatus', { percent: chosen.mastery, count: chosen.questions })}
          </p>
          <Button block onClick={() => onPractise(chosen.topic.id)}>
            {t('modes.practiseTopic')}
          </Button>
          {chosen.bossUnlocked && (
            <Button
              block
              variant="star"
              icon={<Swords className="size-5" aria-hidden />}
              onClick={() => onBoss(chosen.topic.id)}
            >
              {t('modes.boss')}
            </Button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2 pb-2">
          {topics.map((ts) => (
            <li key={ts.topic.id}>
              <Button block variant="secondary" onClick={() => onPractise(ts.topic.id)}>
                {t('deck.topicWithMastery', { title: ts.topic.title, percent: ts.mastery })}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function ExamSheet({
  open,
  onClose,
  onStart,
  extended,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (count: number, minutes: number) => void;
  extended: boolean;
}) {
  const { t } = useTranslation();
  const [count, setCount] = useState(20);
  const [minutes, setMinutes] = useState(30);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('modes.exam')}
      footer={
        <Button block onClick={() => onStart(count, extended ? Math.round(minutes * 1.5) : minutes)}>
          {t('exam.start')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-muted">{t('exam.intro')}</p>
        <div>
          <p className="mb-2 font-semibold">{t('exam.questions')}</p>
          <Segmented
            label={t('exam.questions')}
            value={count}
            onChange={(v) => {
              setCount(v);
              setMinutes(v === 10 ? 15 : v === 20 ? 30 : 60);
            }}
            options={[10, 20, 40].map((n) => ({ value: n, label: formatNumber(n) }))}
          />
        </div>
        <div>
          <p className="mb-2 font-semibold">{t('exam.duration')}</p>
          <Segmented
            label={t('exam.duration')}
            value={minutes}
            onChange={setMinutes}
            options={[10, 15, 30, 45, 60].map((n) => ({
              value: n,
              label: t('common.minutes', { count: n }),
            }))}
          />
          {extended && <p className="mt-2 text-sm text-muted">{t('exam.extended')}</p>}
        </div>
      </div>
    </Sheet>
  );
}

function DeleteDeckButton({ deckId, title }: { deckId: string; title: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const toast = useApp((s) => s.toast);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button variant="danger" block onClick={() => setConfirm(true)}>
        {t('deck.delete')}
      </Button>
      <ConfirmSheet
        open={confirm}
        danger
        title={t('deck.deleteTitle')}
        body={t('deck.deleteBody', { title })}
        confirmLabel={t('common.delete')}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          forgetDeckIndex(deckId);
          const snap = await deleteDeck(deckId);
          setConfirm(false);
          navigate('/decks');
          if (snap)
            toast({
              message: t('deck.deleted', { title }),
              action: { label: t('common.undo'), run: () => void restoreDeck(snap) },
            });
        }}
      />
    </>
  );
}

function DeckSettings({
  open,
  onClose,
  stats,
}: {
  open: boolean;
  onClose: () => void;
  stats: NonNullable<Awaited<ReturnType<typeof deckStats>>>;
}) {
  const { t } = useTranslation();
  const toast = useApp((s) => s.toast);
  const { deck, topics } = stats;
  const [title, setTitle] = useState(deck.title);
  const [lang, setLang] = useState(deck.quizLanguage);
  const [exam, setExam] = useState(deck.examDate ?? '');
  const [regen, setRegen] = useState(topics[0]?.topic.id ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    await updateDeck(deck.id, {
      title: title.trim() || deck.title,
      quizLanguage: lang,
      examDate: exam || null,
    });
    if (exam) {
      const existing = await db.exams.where('deckId').equals(deck.id).first();
      await upsertExam({ id: existing?.id, deckId: deck.id, title: title.trim() || deck.title, date: exam });
    } else await db.exams.where('deckId').equals(deck.id).delete();
    toast({ message: t('common.saved'), tone: 'success' });
    onClose();
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const ids = (await db.questions
        .where('topicId')
        .equals(regen)
        .filter((q) => !q.reported)
        .primaryKeys()) as string[];
      await db.transaction('rw', db.questions, db.cardStates, async () => {
        await db.questions.bulkDelete(ids);
        await db.cardStates.bulkDelete(ids);
      });
      await db.topics.update(regen, { status: 'pending', emptyRounds: 0 });
      await ensureTopicQuestions(regen, 6);
      toast({ message: t('deck.regenerated'), tone: 'success' });
    } catch {
      toast({ message: t('errors.UPSTREAM.title'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('deck.settings')}
      footer={
        <Button block onClick={() => void save()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <TextField
          label={t('newDeck.deckTitle')}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
        <SelectField
          label={t('newDeck.quizLanguage')}
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          options={[
            { value: 'auto', label: t('newDeck.sameAsNotes') },
            ...LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
            ...(LANGUAGES.some((l) => l.code === lang) || lang === 'auto'
              ? []
              : [{ value: lang, label: languageDisplayName(lang) }]),
          ]}
        />
        <TextField
          label={t('newDeck.examDate')}
          type="date"
          min={dayKey(Date.now())}
          value={exam}
          onChange={(e) => setExam(e.target.value)}
        />
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
          <SelectField
            label={t('deck.regenerate')}
            value={regen}
            onChange={(e) => setRegen(e.target.value)}
            options={topics.map((x) => ({ value: x.topic.id, label: x.topic.title }))}
          />
          <p className="text-xs text-muted">{t('deck.regenerateHint')}</p>
          <Button variant="secondary" busy={busy} onClick={() => void regenerate()}>
            {t('deck.regenerateButton')}
          </Button>
        </div>
        <DeleteDeckButton deckId={deck.id} title={deck.title} />
      </div>
    </Sheet>
  );
}
