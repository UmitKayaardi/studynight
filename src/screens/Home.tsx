import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, Flame, Play, Plus, RefreshCw, Snowflake, Sparkles, Star } from 'lucide-react';
import { useApp } from '../store/app';
import { usePlay } from '../store/play';
import { db } from '../db/schema';
import { TabScreen } from '../components/layout/Shell';
import { Mascot, type MascotMood } from '../components/art/Mascot';
import { Button } from '../components/ui/Button';
import { Card, ProgressBar, Ring } from '../components/ui/Controls';
import { allDeckStats, dueCount } from '../lib/deck/stats';
import { dayKey, daysBetween, streakStatus } from '../lib/learning/streak';
import { levelFromXp } from '../lib/learning/xp';
import { formatNumber } from '../lib/platform';

export default function Home() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const profile = useApp((s) => s.profile);
  const refreshProfile = useApp((s) => s.refreshProfile);
  const pendingSession = usePlay(
    (s) => (s.phase === 'question' || s.phase === 'feedback') && s.config?.mode !== 'challenge',
  );

  useEffect(() => {
    if (profile && !profile.onboarded) navigate('/welcome', { replace: true });
  }, [profile, navigate]);
  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const today = dayKey(Date.now());
  const day = useLiveQuery(() => db.days.get(today), [today]);
  const decks = useLiveQuery(() => allDeckStats(), []);
  const due = useLiveQuery(() => dueCount(), []);
  const exams = useLiveQuery(() => db.exams.where('date').aboveOrEqual(today).sortBy('date'), [today]);

  if (!profile) return null;
  const goalMs = profile.dailyGoalMinutes * 60_000;
  const goalProgress = Math.min(1, (day?.activeMs ?? 0) / goalMs);
  const streak = streakStatus(profile.streak, today);
  const level = levelFromXp(profile.xp);
  const hour = new Date().getHours();
  const mood: MascotMood = day?.goalMet
    ? 'celebrating'
    : streak.status === 'at-risk' && hour >= 17
      ? 'sleepy'
      : decks?.length
        ? 'happy'
        : 'encouraging';
  const continueDeck =
    decks?.find((d) => d.deck.status === 'ready' && d.deck.lastPlayedAt) ??
    decks?.find((d) => d.deck.status === 'ready');
  const greetingKey =
    hour < 12 ? 'home.greetingMorning' : hour < 18 ? 'home.greetingAfternoon' : 'home.greetingEvening';

  return (
    <TabScreen>
      <section className="flex items-center gap-3 py-2">
        <Mascot mood={mood} theme={profile.mascotTheme} size={92} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold leading-tight">
            {profile.nickname ? t(`${greetingKey}Name`, { name: profile.nickname }) : t(greetingKey)}
          </h1>
          <p className="text-muted">{t(`home.mood.${mood}`)}</p>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2" aria-label={t('home.statsLabel')}>
        <Card className="flex flex-col items-center gap-1 p-3 text-center">
          <Flame
            className={`size-7 ${streak.current ? 'fill-star text-star-text' : 'text-muted'}`}
            aria-hidden
          />
          <span className="font-display text-xl font-extrabold">{formatNumber(streak.current)}</span>
          <span className="text-xs text-muted">{t('home.streakDays', { count: streak.current })}</span>
          {profile.streak.freezes > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-xs text-muted"
              title={t('home.freezes', { count: profile.streak.freezes })}
            >
              <Snowflake className="size-3" aria-hidden />
              <span className="sr-only">{t('home.freezes', { count: profile.streak.freezes })}</span>
              <span aria-hidden>{formatNumber(profile.streak.freezes)}</span>
            </span>
          )}
        </Card>
        <Card className="flex flex-col items-center gap-1 p-3 text-center">
          <Ring
            value={goalProgress}
            label={t('home.goalRing', { percent: Math.round(goalProgress * 100) })}
            size={52}
          >
            {formatNumber(Math.floor((day?.activeMs ?? 0) / 60_000))}
          </Ring>
          <span className="text-xs text-muted">{t('home.goalOf', { count: profile.dailyGoalMinutes })}</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 p-3 text-center">
          <Star className="size-7 fill-star text-star-text" aria-hidden />
          <span className="font-display text-xl font-extrabold">
            {t('home.level', { level: formatNumber(level.level) })}
          </span>
          <div className="w-full">
            <ProgressBar
              value={level.progress}
              tone="star"
              label={t('home.levelProgress', { xp: formatNumber(profile.xp) })}
            />
          </div>
          <span className="text-xs text-muted">{t('home.xp', { xp: formatNumber(profile.xp) })}</span>
        </Card>
      </section>

      <div className="mt-4 flex flex-col gap-3">
        {pendingSession && (
          <Card className="flex items-center gap-3 border-accent">
            <Play className="size-6 text-accent" aria-hidden />
            <p className="min-w-0 flex-1 font-semibold">{t('home.resume')}</p>
            <Button size="sm" onClick={() => navigate('/play')}>
              {t('common.continue')}
            </Button>
          </Card>
        )}
        {continueDeck && (
          <Card className="flex items-center gap-3">
            <Ring
              value={continueDeck.mastery / 100}
              label={t('deck.masteryLabel', { percent: continueDeck.mastery })}
              size={52}
            >
              {formatNumber(continueDeck.mastery)}
            </Ring>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{t('home.continue')}</p>
              <p className="truncate font-display text-lg font-extrabold">{continueDeck.deck.title}</p>
            </div>
            <Button size="sm" onClick={() => navigate(`/deck/${continueDeck.deck.id}`)}>
              {t('home.go')}
              <span className="sr-only"> {continueDeck.deck.title}</span>
            </Button>
          </Card>
        )}
        {!!due && (
          <Card className="flex items-center gap-3">
            <RefreshCw className="size-6 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-extrabold">{t('home.reviewDue', { count: due })}</p>
              <p className="text-sm text-muted">{t('home.reviewDueHint')}</p>
            </div>
            <Button size="sm" onClick={() => navigate('/review')}>
              {t('home.review')}
            </Button>
          </Card>
        )}
        {exams?.slice(0, 3).map((e) => {
          const n = daysBetween(today, e.date);
          return (
            <Link key={e.id} href="/profile/planner" className="block">
              <Card className="flex items-center gap-3">
                <CalendarClock className="size-6 text-star-text" aria-hidden />
                <p className="min-w-0 flex-1 font-semibold">
                  {n === 0
                    ? t('home.examToday', { title: e.title })
                    : t('home.examIn', { title: e.title, count: n })}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <Button
          size="lg"
          block
          icon={<Plus className="size-6" aria-hidden />}
          onClick={() => navigate('/new')}
        >
          {t('home.newDeck')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          block
          icon={<Sparkles className="size-5" aria-hidden />}
          onClick={() => navigate('/samples')}
        >
          {t('home.trySample')}
        </Button>
      </div>
    </TabScreen>
  );
}
