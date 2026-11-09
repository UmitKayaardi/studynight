import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { Play } from 'lucide-react';
import { SubScreen } from '../components/layout/Shell';
import { Button } from '../components/ui/Button';
import { Card, Chip } from '../components/ui/Controls';
import { listSamples, openSample } from '../lib/samples';
import { languageDisplayName } from '../lib/platform';
import { useApp } from '../store/app';

export default function Samples() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const samples = listSamples();

  const open = async (id: string) => {
    const info = samples.find((s) => s.id === id)!;
    setBusy(id);
    try {
      const deckId = await openSample(info);
      navigate(`/deck/${deckId}`);
    } catch {
      toast({ message: t('errors.storage'), tone: 'error' });
      setBusy(null);
    }
  };

  return (
    <SubScreen title={t('samples.title')} back="/">
      <p className="py-2 text-muted">{t('samples.intro')}</p>
      <ul className="flex flex-col gap-3">
        {samples.map((s) => (
          <li key={s.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <h2 lang={s.language} className="min-w-0 flex-1 font-display text-lg font-extrabold">
                  {s.title}
                </h2>
                <Chip tone="star">{languageDisplayName(s.language)}</Chip>
              </div>
              <p lang={s.language} className="text-sm text-muted">
                {s.description}
              </p>
              <Button block busy={busy === s.id} icon={<Play className="size-5" aria-hidden />} onClick={() => void open(s.id)}>
                {t('samples.play', { count: s.questions })}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </SubScreen>
  );
}
