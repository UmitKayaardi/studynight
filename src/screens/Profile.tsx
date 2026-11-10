import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarDays,
  ChevronRight,
  FileText,
  Flame,
  Info,
  Scale,
  Settings,
  ShieldCheck,
  Snowflake,
  Star,
} from 'lucide-react';
import { db } from '../db/schema';
import { useApp } from '../store/app';
import { TabScreen } from '../components/layout/Shell';
import { Avatar, BadgeMedal } from '../components/art/Art';
import { Card, ProgressBar } from '../components/ui/Controls';
import { Sheet } from '../components/ui/Sheet';
import { Heatmap, LineChart } from '../components/Charts';
import { BADGE_IDS } from '../lib/learning/badges';
import { addDays, dayKey, dayIndex, streakStatus } from '../lib/learning/streak';
import { levelFromXp } from '../lib/learning/xp';
import { allDeckStats } from '../lib/deck/stats';
import { formatDate, formatDuration, formatNumber, formatPercent } from '../lib/platform';

export default function Profile() {
  const { t } = useTranslation();
  const profile = useApp((s) => s.profile);
  const refreshProfile = useApp((s) => s.refreshProfile);
  const [badge, setBadge] = useState<string | null>(null);
  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const today = dayKey(Date.now());
  const days = useLiveQuery(() => db.days.toArray(), []);
  const earned = useLiveQuery(() => db.badges.toArray(), []);
  const reviews = useLiveQuery(
    () =>
      db.reviews
        .where('at')
        .above(Date.now() - 56 * 86_400_000)
        .toArray(),
    [],
  );
  const decks = useLiveQuery(() => allDeckStats(), []);

  const calendar = useMemo(() => {
    if (!profile || !days) return [];
    const byDay = new Map(days.map((d) => [d.day, d]));
    const goal = profile.dailyGoalMinutes * 60_000;
    // 12 weeks ending this week; columns start on Monday.
    const todayIdx = dayIndex(today);
    const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    const start = addDays(today, -(7 * 11 + weekday));
    return Array.from({ length: 84 }, (_, i) => {
      const key = addDays(start, i);
      const d = byDay.get(key);
      const ms = d?.activeMs ?? 0;
      const level = (
        !d || !d.answered ? 0 : ms >= goal * 2 ? 4 : d.goalMet || ms >= goal ? 3 : ms >= goal / 2 ? 2 : 1
      ) as 0 | 1 | 2 | 3 | 4;
      const frozen = profile.streak.frozenDays.includes(key);
      return {
        key,
        level,
        frozen,
        empty: dayIndex(key) > todayIdx,
        detail: frozen
          ? t('profile.frozenDay', { date: formatDate(key, { day: 'numeric', month: 'short' }) })
          : t('profile.dayDetail', {
              date: formatDate(key, { day: 'numeric', month: 'short' }),
              count: d?.answered ?? 0,
              time: formatDuration(ms),
            }),
      };
    });
  }, [days, profile, today, t]);

  const weekly = useMemo(() => {
    if (!reviews) return [];
    const weeks = Array.from({ length: 8 }, () => ({ right: 0, total: 0 }));
    const now = Date.now();
    for (const r of reviews) {
      const w = 7 - Math.min(7, Math.floor((now - r.at) / (7 * 86_400_000)));
      weeks[w]!.total++;
      if (r.correct) weeks[w]!.right++;
    }
    return weeks
      .map((w, i) => ({ ...w, i }))
      .filter((w) => w.total > 0)
      .map((w) => {
        const d = new Date(now - (7 - w.i) * 7 * 86_400_000);
        const label = formatDate(d, { day: 'numeric', month: 'short' });
        return {
          label,
          value: w.right / w.total,
          detail: t('profile.weekDetail', {
            week: label,
            percent: formatPercent(w.right / w.total),
            count: w.total,
          }),
        };
      });
  }, [reviews, t]);

  const topicRanking = useMemo(() => {
    const all = (decks ?? []).flatMap((d) =>
      d.topics.filter((x) => x.practised).map((x) => ({ ...x, deck: d.deck.title })),
    );
    const sorted = all.sort((a, b) => b.mastery - a.mastery);
    return {
      strongest: sorted.slice(0, 3),
      weakest: sorted
        .slice(-3)
        .reverse()
        .filter((x) => !sorted.slice(0, 3).includes(x)),
    };
  }, [decks]);

  if (!profile) return null;
  const level = levelFromXp(profile.xp);
  const streak = streakStatus(profile.streak, today);
  const studyMs = days?.reduce((s, d) => s + d.activeMs, 0) ?? 0;
  const owned = new Set(earned?.map((b) => b.id));

  return (
    <TabScreen title={t('nav.profile')}>
      <Card className="mt-2 flex items-center gap-4">
        <Avatar index={profile.avatar} size={72} label={t('profile.avatar')} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-2xl font-extrabold">
            {profile.nickname || t('profile.noName')}
          </p>
          <p className="text-sm text-muted">
            {t('profile.memberSince', {
              date: formatDate(profile.createdAt, { month: 'long', year: 'numeric' }),
            })}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Star className="size-5 fill-star text-star-text" aria-hidden />
            <span className="font-display font-extrabold">
              {t('home.level', { level: formatNumber(level.level) })}
            </span>
            <span className="text-sm text-muted">{t('home.xp', { xp: formatNumber(profile.xp) })}</span>
          </div>
          <ProgressBar
            value={level.progress}
            tone="star"
            label={t('profile.nextLevel', { xp: formatNumber(level.span - level.into) })}
          />
        </div>
      </Card>

      <section className="mt-3 grid grid-cols-3 gap-2" aria-label={t('profile.streaks')}>
        <Card className="p-3 text-center">
          <Flame className="mx-auto size-6 fill-star text-star-text" aria-hidden />
          <p className="font-display text-xl font-extrabold">{formatNumber(streak.current)}</p>
          <p className="text-xs text-muted">{t('profile.current')}</p>
        </Card>
        <Card className="p-3 text-center">
          <Flame className="mx-auto size-6 text-muted" aria-hidden />
          <p className="font-display text-xl font-extrabold">{formatNumber(profile.streak.best)}</p>
          <p className="text-xs text-muted">{t('profile.best')}</p>
        </Card>
        <Card className="p-3 text-center">
          <Snowflake className="mx-auto size-6 text-accent" aria-hidden />
          <p className="font-display text-xl font-extrabold">{formatNumber(profile.streak.freezes)}</p>
          <p className="text-xs text-muted">{t('profile.freezes')}</p>
        </Card>
      </section>
      <p className="mt-2 text-xs text-muted">{t('profile.freezeHint')}</p>

      <Card className="mt-3">
        <h2 className="mb-3 font-display font-extrabold">{t('profile.calendar')}</h2>
        <Heatmap
          cells={calendar}
          caption={t('profile.calendar')}
          valueLabel={t('profile.activity')}
          legend={{ less: t('profile.less'), more: t('profile.more') }}
        />
      </Card>

      <Card className="mt-3">
        <h2 className="mb-3 font-display font-extrabold">{t('profile.stats')}</h2>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-muted">{t('profile.answered')}</dt>
            <dd className="font-display text-lg font-extrabold">
              {formatNumber(profile.stats.questionsAnswered)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('profile.accuracy')}</dt>
            <dd className="font-display text-lg font-extrabold">
              {profile.stats.questionsAnswered
                ? formatPercent(profile.stats.correctAnswers / profile.stats.questionsAnswered)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('profile.studyTime')}</dt>
            <dd className="font-display text-lg font-extrabold">{formatDuration(studyMs)}</dd>
          </div>
        </dl>
        {weekly.length > 1 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-bold">{t('profile.accuracyOverTime')}</h3>
            <LineChart
              data={weekly}
              caption={t('profile.accuracyOverTime')}
              valueLabel={t('profile.accuracy')}
            />
          </div>
        )}
        {topicRanking.strongest.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-bold">{t('profile.strongest')}</h3>
              <ul className="text-sm">
                {topicRanking.strongest.map((x) => (
                  <li key={x.topic.id} className="flex justify-between gap-2">
                    <span className="truncate">{x.topic.title}</span>
                    <span className="font-bold">{formatNumber(x.mastery)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            {topicRanking.weakest.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-bold">{t('profile.weakest')}</h3>
                <ul className="text-sm">
                  {topicRanking.weakest.map((x) => (
                    <li key={x.topic.id} className="flex justify-between gap-2">
                      <span className="truncate">{x.topic.title}</span>
                      <span className="font-bold">{formatNumber(x.mastery)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="mt-3">
        <h2 className="mb-3 font-display font-extrabold">
          {t('profile.badges', { count: owned.size, total: BADGE_IDS.length })}
        </h2>
        <ul className="grid grid-cols-3 gap-3 min-[420px]:grid-cols-4">
          {BADGE_IDS.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setBadge(id)}
                className="flex w-full flex-col items-center gap-1 text-center"
                aria-label={
                  owned.has(id)
                    ? t('profile.badgeEarned', { name: t(`badges.${id}.name`) })
                    : t('profile.badgeLocked', { name: t(`badges.${id}.name`) })
                }
              >
                <BadgeMedal id={id} earned={owned.has(id)} size={52} />
                <span
                  className={`w-full text-xs leading-tight font-semibold break-words [hyphens:auto] ${owned.has(id) ? '' : 'text-muted'}`}
                >
                  {t(`badges.${id}.name`)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <nav className="mt-3 flex flex-col gap-2" aria-label={t('profile.more')}>
        <ProfileLink href="/profile/planner" icon={<CalendarDays />} label={t('planner.title')} />
        <ProfileLink href="/profile/settings" icon={<Settings />} label={t('settings.title')} />
        <ProfileLink href="/privacy" icon={<ShieldCheck />} label={t('legal.privacy')} />
        <ProfileLink href="/terms" icon={<Scale />} label={t('legal.terms')} />
        <ProfileLink href="/licences" icon={<FileText />} label={t('legal.licences')} />
        <ProfileLink href="/about" icon={<Info />} label={t('legal.about')} />
      </nav>

      <Sheet open={!!badge} onClose={() => setBadge(null)} title={badge ? t(`badges.${badge}.name`) : ''}>
        {badge && (
          <div className="flex flex-col items-center gap-3 pb-4 text-center">
            <BadgeMedal id={badge} earned={owned.has(badge)} size={96} />
            <p>{t(`badges.${badge}.desc`)}</p>
            <p className="text-sm text-muted">
              {owned.has(badge)
                ? t('profile.earnedOn', {
                    date: formatDate(earned!.find((b) => b.id === badge)!.earnedAt, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }),
                  })
                : t('profile.notYet')}
            </p>
          </div>
        )}
      </Sheet>
    </TabScreen>
  );
}

function ProfileLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 font-semibold shadow-card"
    >
      <span className="text-accent [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-5 text-muted rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}
