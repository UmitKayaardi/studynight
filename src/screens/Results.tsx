import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { Award, Clock, Flame, Send, Share2, Target, Trophy, Zap } from 'lucide-react';
import { useApp } from '../store/app';
import { usePlay } from '../store/play';
import { db } from '../db/schema';
import { Mascot } from '../components/art/Mascot';
import { Avatar, BadgeMedal } from '../components/art/Art';
import { Button } from '../components/ui/Button';
import { Card, Chip, Ring } from '../components/ui/Controls';
import { RichText } from '../components/RichText';
import { ShareSheet } from '../components/Share';
import { ChallengeSheet } from '../components/ChallengeSheet';
import { answerText } from '../lib/game/check';
import { predictedBand } from '../lib/learning/badges';
import { retrievability } from '../lib/learning/fsrs';
import { formatDuration, formatNumber, formatPercent, haptic, reducedMotion } from '../lib/platform';
import { play as sound } from '../lib/sound';

async function confetti() {
  if (reducedMotion()) return;
  const { default: fire } = await import('canvas-confetti');
  void fire({ particleCount: 120, spread: 75, origin: { y: 0.65 }, colors: ['#2ee6c5', '#ffc94d', '#c3b2ff', '#ff9fc1'], disableForReducedMotion: true });
}

export default function Results() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const s = usePlay();
  const profile = useApp((x) => x.profile);
  const refreshProfile = useApp((x) => x.refreshProfile);
  const toast = useApp((x) => x.toast);
  const [share, setShare] = useState(false);
  const [challenge, setChallenge] = useState(false);
  const config = s.config;
  const deckId = config && 'deckId' in config ? config.deckId : undefined;
  const counted = s.answers.filter((a) => !a.reported);
  const correct = counted.filter((a) => a.correct).length;
  const accuracy = counted.length ? correct / counted.length : 0;
  const result = s.result;

  const topics = useLiveQuery(() => (deckId ? db.topics.where('deckId').equals(deckId).toArray() : []), [deckId]);
  const weakest = useMemo(() => {
    const by = new Map<string, { right: number; total: number }>();
    for (const a of counted) {
      const e = by.get(a.topicId) ?? { right: 0, total: 0 };
      e.total++;
      if (a.correct) e.right++;
      by.set(a.topicId, e);
    }
    return [...by]
      .filter(([, e]) => e.right < e.total)
      .sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total)
      .slice(0, 3)
      .map(([id, e]) => ({ id, title: topics?.find((x) => x.id === id)?.title ?? '', accuracy: e.right / e.total }))
      .filter((x) => x.title);
  }, [counted, topics]);

  const band = useLiveQuery(async () => {
    if (config?.mode !== 'exam' || !deckId) return null;
    const cards = await db.cardStates.where('deckId').equals(deckId).toArray();
    const now = Date.now();
    const meanR = cards.length ? cards.reduce((acc, c) => acc + retrievability(c, now), 0) / cards.length : accuracy;
    return predictedBand(accuracy, meanR, counted.length);
  }, [config?.mode, deckId, accuracy, counted.length]);

  useEffect(() => {
    if (!config) {
      navigate('/', { replace: true });
      return;
    }
    void refreshProfile();
    const good = accuracy >= 0.7 || result?.newBadges.length || (config.mode === 'boss' && s.hearts > 0);
    if (good) {
      void confetti();
      sound(config.mode === 'boss' ? 'victory' : 'levelUp');
      haptic('celebrate');
    }
    if (result && result.levelAfter > result.levelBefore) toast({ message: t('results.levelUp', { level: result.levelAfter }), tone: 'success' });
    if (sessionStorage.getItem('sn-challenge-intent') && counted.length) {
      sessionStorage.removeItem('sn-challenge-intent');
      setChallenge(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config) return null;
  if (config.mode === 'challenge') return <ChallengeResult />;

  const bossWon = config.mode === 'boss' && s.hearts > 0 && correct >= s.items.length;
  const mood = bossWon || accuracy >= 0.8 ? 'celebrating' : accuracy >= 0.5 ? 'happy' : 'encouraging';
  const back = deckId ? `/deck/${deckId}` : '/';

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <section className="flex flex-col items-center gap-2 text-center" aria-live="polite">
        <Mascot mood={mood} theme={profile?.mascotTheme ?? 0} size={120} />
        {config.mode === 'boss' && <h1 className="font-display text-3xl font-extrabold">{bossWon ? t('results.bossWon') : t('results.bossLost')}</h1>}
        {config.mode === 'sudden' && (
          <h1 className="font-display text-3xl font-extrabold">{t('results.suddenScore', { count: correct })}</h1>
        )}
        {config.mode !== 'boss' && config.mode !== 'sudden' && <h1 className="font-display text-3xl font-extrabold">{t('results.score', { correct, total: counted.length })}</h1>}
        {result && (
          <Chip tone="star" className="text-sm">
            <Trophy className="size-4" aria-hidden />
            {t(`titles.${result.title}`)}
          </Chip>
        )}
        {result?.newBestSuddenDeath && <p className="font-semibold text-accent">{t('results.newBest')}</p>}
      </section>

      <section className="grid grid-cols-2 gap-2" aria-label={t('results.stats')}>
        <Stat icon={<Target />} label={t('results.accuracy')} value={formatPercent(accuracy)} />
        <Stat icon={<Zap />} label={t('results.xp')} value={t('results.xpValue', { xp: formatNumber(s.xp + (result?.bonusXp ?? 0)) })} />
        <Stat icon={<Flame />} label={t('results.bestCombo')} value={formatNumber(s.bestCombo)} />
        <Stat icon={<Clock />} label={t('results.time')} value={formatDuration(Date.now() - s.startedAt)} />
      </section>

      {result?.goalJustMet && <Card className="border-good bg-good-soft text-center font-semibold">{t('results.goalMet')}</Card>}
      {!!result?.newBadges.length && (
        <Card className="flex flex-col gap-2">
          <p className="font-display font-extrabold">{t('results.newBadges')}</p>
          <ul className="flex flex-wrap gap-3">
            {result.newBadges.map((b) => (
              <li key={b} className="flex items-center gap-2">
                <BadgeMedal id={b} earned size={44} />
                <span className="text-sm font-semibold">{t(`badges.${b}.name`)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {config.mode === 'exam' && band && (
        <Card className="flex flex-col gap-2">
          <p className="font-display font-extrabold">{t('exam.reportTitle')}</p>
          <p className="text-2xl font-extrabold">{t('exam.band', { low: band.low, high: band.high })}</p>
          <p className="text-sm text-muted">{t('exam.estimate')}</p>
        </Card>
      )}

      {config.mode === 'exam' && <ExamBreakdown />}

      {weakest.length > 0 && deckId && (
        <Card className="flex flex-col gap-2">
          <p className="font-display font-extrabold">{t('results.weakest')}</p>
          <ul className="flex flex-col gap-2">
            {weakest.map((w) => (
              <li key={w.id} className="flex items-center gap-2">
                <Ring value={w.accuracy} size={36} stroke={4} label={formatPercent(w.accuracy)} color="var(--sn-bad)" />
                <span className="flex-1 text-sm font-semibold">{w.title}</span>
              </li>
            ))}
          </ul>
          <Button
            onClick={() => {
              void s.start({ mode: 'topic', deckId, topicId: weakest[0]!.id });
              navigate('/play');
            }}
          >
            {t('results.practiseThese')}
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {config.mode === 'topic' && (
          <Button
            size="lg"
            block
            variant="star"
            onClick={() => {
              void s.start({ ...config });
              navigate('/play');
            }}
          >
            {t('results.keepPractising')}
          </Button>
        )}
        <Button size="lg" block variant={config.mode === 'topic' ? 'secondary' : 'primary'} onClick={() => navigate(back)}>
          {t('results.done')}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Share2 className="size-5" aria-hidden />} onClick={() => setShare(true)}>
            {t('share.button')}
          </Button>
          <Button variant="secondary" icon={<Send className="size-5" aria-hidden />} onClick={() => setChallenge(true)} disabled={!counted.length}>
            {t('modes.challenge')}
          </Button>
        </div>
      </div>
      <ShareSheet
        open={share}
        onClose={() => setShare(false)}
        data={{ correct, total: counted.length, accuracy, xp: s.xp + (result?.bonusXp ?? 0), title: result ? t(`titles.${result.title}`) : '', deckId }}
      />
      <ChallengeSheet open={challenge} onClose={() => setChallenge(false)} />
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="text-accent [&_svg]:size-6" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block font-display text-lg font-extrabold">{value}</span>
      </span>
    </Card>
  );
}

function ExamBreakdown() {
  const { t } = useTranslation();
  const s = usePlay();
  const topics = useLiveQuery(() => db.topics.bulkGet([...new Set(s.items.map((i) => i.topicId))]), [s.items.length]);
  const mistakes = s.items.filter((i) => s.answers.some((a) => a.itemId === i.id && !a.correct && !a.reported));
  return (
    <>
      <Card className="flex flex-col gap-2">
        <p className="font-display font-extrabold">{t('exam.byTopic')}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {topics?.filter(Boolean).map((tp) => {
            const items = s.items.filter((i) => i.topicId === tp!.id);
            const right = items.filter((i) => s.answers.some((a) => a.itemId === i.id && a.correct)).length;
            return (
              <li key={tp!.id} className="flex justify-between gap-2">
                <span>{tp!.title}</span>
                <span className="font-bold">{t('results.score', { correct: right, total: items.length })}</span>
              </li>
            );
          })}
        </ul>
      </Card>
      {mistakes.length > 0 && (
        <Card className="flex flex-col gap-3">
          <p className="font-display font-extrabold">{t('exam.mistakes')}</p>
          {mistakes.map((m) => (
            <div key={m.id} className="border-t border-border pt-2 text-sm">
              <RichText text={m.content.prompt} className="font-semibold" />
              <p className="mt-1">
                {t('play.answerWas')} <strong>{answerText(m.content, { true: t('play.true'), false: t('play.false') })}</strong>
              </p>
              <RichText text={m.content.explanation} className="mt-1 text-muted" />
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

/** A friend's result next to the challenger's (scores in challenge links are for fun). */
function ChallengeResult() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const s = usePlay();
  const profile = useApp((x) => x.profile);
  const config = s.config as Extract<NonNullable<typeof s.config>, { mode: 'challenge' }>;
  const mine = s.answers.filter((a) => a.correct).length;
  const theirs = config.challenge.score;
  const total = config.challenge.questions.length;
  useEffect(() => {
    if (mine >= theirs) {
      void confetti();
      sound('victory');
    }
  }, [mine, theirs]);
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10 text-center">
      <h1 className="font-display text-3xl font-extrabold">{mine > theirs ? t('challenge.youWin') : mine === theirs ? t('challenge.draw') : t('challenge.theyWin')}</h1>
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col items-center gap-2">
          <Avatar index={profile?.avatar ?? 0} size={56} />
          <p className="font-semibold">{profile?.nickname || t('challenge.you')}</p>
          <p className="font-display text-3xl font-extrabold">{t('results.score', { correct: mine, total })}</p>
        </Card>
        <Card className="flex flex-col items-center gap-2">
          <Avatar index={config.challenge.avatar} size={56} />
          <p className="font-semibold">{config.challenge.nickname || t('challenge.friend')}</p>
          <p className="font-display text-3xl font-extrabold">{t('results.score', { correct: theirs, total })}</p>
        </Card>
      </div>
      <p className="text-sm text-muted">{t('challenge.forFun')}</p>
      <Button size="lg" icon={<Award className="size-5" aria-hidden />} onClick={() => navigate(profile?.onboarded ? '/new' : '/welcome')}>
        {t('challenge.makeOwn')}
      </Button>
      <Button variant="ghost" onClick={() => navigate('/')}>
        {t('common.goHome')}
      </Button>
    </main>
  );
}
