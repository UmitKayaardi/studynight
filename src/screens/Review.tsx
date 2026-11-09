import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { RefreshCw } from 'lucide-react';
import { TabScreen } from '../components/layout/Shell';
import { Mascot } from '../components/art/Mascot';
import { Button } from '../components/ui/Button';
import { Card, Chip } from '../components/ui/Controls';
import { BarChart } from '../components/Charts';
import { usePlay } from '../store/play';
import { allDeckStats, reviewForecast } from '../lib/deck/stats';
import { formatDate, formatNumber } from '../lib/platform';

export default function Review() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const start = usePlay((s) => s.start);
  const decks = useLiveQuery(() => allDeckStats(), []);
  const forecast = useLiveQuery(() => reviewForecast(7), []);
  const total = decks?.reduce((s, d) => s + d.due, 0) ?? 0;

  return (
    <TabScreen title={t('nav.review')}>
      <section className="flex items-center gap-3 py-3">
        <Mascot mood={total ? 'encouraging' : 'happy'} size={84} />
        <div>
          <p className="font-display text-2xl font-extrabold">{t('review.due', { count: total })}</p>
          <p className="text-muted">{total ? t('review.dueHint') : t('review.caughtUp')}</p>
        </div>
      </section>
      <Button
        size="lg"
        block
        disabled={!total}
        icon={<RefreshCw className="size-5" aria-hidden />}
        onClick={() => {
          void start({ mode: 'review' });
          navigate('/play');
        }}
      >
        {t('review.start')}
      </Button>

      {forecast && (
        <Card className="mt-4">
          <h2 className="mb-3 font-display font-extrabold">{t('review.forecast')}</h2>
          <BarChart
            caption={t('review.forecast')}
            valueLabel={t('review.questions')}
            data={forecast.map((v, i) => {
              const d = new Date();
              d.setDate(d.getDate() + i);
              const label = i === 0 ? t('review.today') : formatDate(d, { weekday: 'short' });
              return { label, value: v, detail: t('review.forecastDetail', { day: label, count: v }) };
            })}
          />
        </Card>
      )}

      <h2 className="mt-5 mb-2 font-display text-xl font-extrabold">{t('review.byDeck')}</h2>
      <ul className="flex flex-col gap-2">
        {decks
          ?.filter((d) => d.deck.status === 'ready')
          .map((d) => (
            <li key={d.deck.id}>
              <Link href={`/deck/${d.deck.id}`} className="block">
                <Card className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate font-semibold">{d.deck.title}</span>
                  <Chip tone={d.due ? 'accent' : 'neutral'}>{t('decks.due', { count: d.due })}</Chip>
                </Card>
              </Link>
            </li>
          ))}
        {decks?.length === 0 && <p className="text-muted">{t('decks.emptyBody')}</p>}
      </ul>
      <p className="mt-4 text-xs text-muted">{t('review.how', { n: formatNumber(90) })}</p>
    </TabScreen>
  );
}
