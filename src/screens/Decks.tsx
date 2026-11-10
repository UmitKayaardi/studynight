import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Loader2, Plus, Sparkles } from 'lucide-react';
import { TabScreen } from '../components/layout/Shell';
import { Mascot } from '../components/art/Mascot';
import { Button } from '../components/ui/Button';
import { Card, Chip, Ring } from '../components/ui/Controls';
import { allDeckStats } from '../lib/deck/stats';
import { formatNumber } from '../lib/platform';

export default function Decks() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const decks = useLiveQuery(() => allDeckStats(), []);

  return (
    <TabScreen title={t('nav.decks')}>
      <div className="flex flex-col gap-3 pt-2">
        <Button
          size="lg"
          block
          icon={<Plus className="size-6" aria-hidden />}
          onClick={() => navigate('/new')}
        >
          {t('home.newDeck')}
        </Button>
        {decks && decks.length === 0 && (
          <Card className="flex flex-col items-center gap-3 py-8 text-center">
            <Mascot mood="encouraging" size={110} />
            <p className="font-display text-xl font-extrabold">{t('decks.emptyTitle')}</p>
            <p className="text-muted">{t('decks.emptyBody')}</p>
          </Card>
        )}
        <ul className="flex flex-col gap-3">
          {decks?.map(({ deck, mastery, questions, due, topics }) => (
            <li key={deck.id}>
              <Link href={`/deck/${deck.id}`} className="block">
                <Card className="flex items-center gap-3 transition hover:border-accent">
                  {deck.status === 'processing' ? (
                    <Loader2 className="size-12 animate-spin text-accent" aria-hidden />
                  ) : deck.status === 'error' ? (
                    <AlertTriangle className="size-12 text-bad" aria-hidden />
                  ) : (
                    <Ring
                      value={mastery / 100}
                      label={t('deck.masteryLabel', { percent: mastery })}
                      size={52}
                    >
                      {formatNumber(mastery)}
                    </Ring>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-extrabold">{deck.title}</p>
                    <p className="text-sm text-muted">
                      {deck.status === 'processing'
                        ? t('decks.processing')
                        : deck.status === 'error'
                          ? t('decks.failed')
                          : `${t('decks.topicCount', { count: topics.length })} · ${t('decks.questionCount', { count: questions })}`}
                    </p>
                  </div>
                  {due > 0 && <Chip tone="accent">{t('decks.due', { count: due })}</Chip>}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        <Button
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
