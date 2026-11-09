import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, GraduationCap, Plus, Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import { deleteExam, updateDeck, upsertExam } from '../db/repo';
import type { ExamRecord } from '../db/types';
import { SubScreen } from '../components/layout/Shell';
import { Mascot } from '../components/art/Mascot';
import { Button, IconButton } from '../components/ui/Button';
import { Card, SelectField, TextField } from '../components/ui/Controls';
import { Sheet } from '../components/ui/Sheet';
import { useApp } from '../store/app';
import { usePlay } from '../store/play';
import { deckStats } from '../lib/deck/stats';
import { buildPlan, type Plan } from '../lib/learning/planner';
import { dayKey } from '../lib/learning/streak';
import { buildIcs, downloadFile } from '../lib/ics';
import { bumpStat } from '../lib/game/record';
import { formatDate, formatNumber } from '../lib/platform';

export default function Planner() {
  const { t } = useTranslation();
  const today = dayKey(Date.now());
  const exams = useLiveQuery(() => db.exams.orderBy('date').toArray(), []);
  const decks = useLiveQuery(() => db.decks.filter((d) => d.status === 'ready').toArray(), []);
  const [adding, setAdding] = useState(false);

  return (
    <SubScreen title={t('planner.title')} back="/profile">
      <p className="py-2 text-muted">{t('planner.intro')}</p>
      {exams?.length === 0 && (
        <Card className="my-3 flex flex-col items-center gap-2 text-center">
          <Mascot mood="thinking" size={100} />
          <p>{t('planner.empty')}</p>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {exams?.map((e) => (
          <li key={e.id}>
            <ExamCard exam={e} today={today} />
          </li>
        ))}
      </ul>
      <Button className="mt-4" block size="lg" icon={<Plus className="size-5" aria-hidden />} onClick={() => setAdding(true)} disabled={!decks?.length}>
        {t('planner.add')}
      </Button>
      {!decks?.length && <p className="mt-2 text-sm text-muted">{t('planner.needDeck')}</p>}
      {decks && <AddExam open={adding} onClose={() => setAdding(false)} decks={decks.map((d) => ({ id: d.id, title: d.title }))} />}
    </SubScreen>
  );
}

function AddExam({ open, onClose, decks }: { open: boolean; onClose: () => void; decks: Array<{ id: string; title: string }> }) {
  const { t } = useTranslation();
  const toast = useApp((s) => s.toast);
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const save = async () => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck || !date) return;
    await upsertExam({ deckId, title: title.trim() || deck.title, date });
    await updateDeck(deckId, { examDate: date });
    const badges = await bumpStat('examsPlanned');
    if (badges.length) toast({ message: t('badges.earned', { name: t(`badges.${badges[0]}.name`) }), tone: 'success' });
    setTitle('');
    setDate('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('planner.add')} footer={<Button block disabled={!date || !deckId} onClick={() => void save()}>{t('common.save')}</Button>}>
      <div className="flex flex-col gap-4 pb-2">
        <SelectField label={t('planner.deck')} value={deckId} onChange={(e) => setDeckId(e.target.value)} options={decks.map((d) => ({ value: d.id, label: d.title }))} />
        <TextField label={t('planner.examName')} value={title} maxLength={120} placeholder={decks.find((d) => d.id === deckId)?.title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label={t('planner.date')} type="date" min={dayKey(Date.now())} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
    </Sheet>
  );
}

function ExamCard({ exam, today }: { exam: ExamRecord; today: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const start = usePlay((s) => s.start);
  const [time, setTime] = useState('18:00');
  const data = useLiveQuery(async () => {
    const stats = await deckStats(exam.deckId);
    if (!stats) return null;
    const plan = buildPlan({
      today,
      examDate: exam.date,
      topics: stats.topics.map((x) => ({ id: x.topic.id, title: x.topic.title, mastery: x.mastery, questionCount: x.questions })),
      dueReviews: stats.due,
    });
    return { stats, plan };
  }, [exam.id, exam.date, today]);
  if (!data) return null;
  const { stats, plan } = data;
  const topicTitle = (id: string) => stats.topics.find((x) => x.topic.id === id)?.topic.title ?? '';
  const todayPlan = plan.days[0];

  const exportIcs = () => {
    const ics = buildIcs({
      examTitle: exam.title,
      days: plan.days,
      time,
      minutes: 30,
      describe: (d) => ({
        summary: d.mockExam ? t('planner.icsMock', { title: exam.title }) : t('planner.icsSummary', { title: exam.title, count: d.practice + d.reviews }),
        description: [d.focusTopicIds.map(topicTitle).filter(Boolean).join(', '), t('planner.icsOpen')].filter(Boolean).join('\n'),
      }),
    });
    downloadFile(`studynight-${exam.date}.ics`, ics, 'text/calendar');
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <GraduationCap className="mt-1 size-6 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold">{exam.title}</p>
          <p className="text-sm text-muted">
            {formatDate(exam.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {stats.deck.title}
          </p>
        </div>
        <IconButton label={t('planner.remove', { title: exam.title })} onClick={() => void deleteExam(exam.id)}>
          <Trash2 className="size-5" aria-hidden />
        </IconButton>
      </div>
      <PlanSummary plan={plan} topicTitle={topicTitle} />
      {plan.status !== 'past' && todayPlan && (
        <Button
          onClick={() => {
            const focus = todayPlan.focusTopicIds[0];
            void start(focus ? { mode: 'topic', deckId: exam.deckId, topicId: focus } : { mode: 'quick', deckId: exam.deckId });
            navigate('/play');
          }}
        >
          {t('planner.startToday')}
        </Button>
      )}
      {plan.status === 'upcoming' && (
        <div className="flex items-end gap-2">
          <div className="w-32">
            <TextField label={t('planner.time')} type="time" value={time} onChange={(e) => setTime(e.target.value || '18:00')} />
          </div>
          <Button variant="secondary" className="flex-1" icon={<CalendarPlus className="size-5" aria-hidden />} onClick={exportIcs}>
            {t('planner.addToCalendar')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function PlanSummary({ plan, topicTitle }: { plan: Plan; topicTitle: (id: string) => string }) {
  const { t } = useTranslation();
  if (plan.status === 'past') return <p className="text-sm text-muted">{t('planner.past')}</p>;
  if (plan.status === 'today') return <p className="font-semibold">{t('planner.today')}</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">{t('planner.daysLeft', { count: plan.daysLeft })}</p>
      <ol className="flex flex-col gap-1 text-sm">
        {plan.days.slice(0, 7).map((d) => (
          <li key={d.date} className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2">
            <span className="w-20 shrink-0 font-semibold">{formatDate(d.date, { weekday: 'short', day: 'numeric' })}</span>
            <span className="min-w-0 flex-1">
              {d.mockExam
                ? t('planner.mockDay', { count: d.reviews })
                : t('planner.dayPlan', { practice: formatNumber(d.practice), count: d.reviews })}
              {d.focusTopicIds.length > 0 && <span className="block truncate text-muted">{d.focusTopicIds.map(topicTitle).filter(Boolean).join(', ')}</span>}
            </span>
          </li>
        ))}
      </ol>
      {plan.days.length > 7 && <p className="text-xs text-muted">{t('planner.more', { count: plan.days.length - 7 })}</p>}
    </div>
  );
}
