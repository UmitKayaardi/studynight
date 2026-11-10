import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { db } from '../db/schema';
import { useApp } from '../store/app';
import { embedDeck, ensureIndex, loadSmartSearch, useSmartSearch } from '../lib/deck/embed';
import { embedClient, onMeteredConnection } from '../lib/search/embedClient';
import { EMBED_DOWNLOAD_MB } from '../lib/search/embedProtocol';
import { formatNumber, formatPercent } from '../lib/platform';
import { Button } from './ui/Button';
import { Card, ProgressBar } from './ui/Controls';

/**
 * Asks once before downloading the Smart search model (always on mobile data); when enabled, embeds the deck in
 * the background. Without the model, search falls back to keywords silently.
 */
export function SmartSearchCard({ deckId }: { deckId: string }) {
  const { t } = useTranslation();
  const setting = useApp((s) => s.settings.smartSearch);
  const updateSetting = useApp((s) => s.updateSetting);
  const smart = useSmartSearch();
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId]);
  const [downloaded, setDownloaded] = useState<boolean | null>(null);

  useEffect(() => {
    void embedClient.isDownloaded().then(setDownloaded);
  }, [smart.status]);

  const metered = onMeteredConnection();
  const mayRun = setting === 'on' && (downloaded || !metered);
  useEffect(() => {
    if (!deck || !mayRun || !navigator.onLine) return;
    if (deck.embedState !== 'done') void embedDeck(deckId);
    else void loadSmartSearch().then(() => ensureIndex(deckId));
  }, [deck, deckId, mayRun]);

  if (!deck || downloaded === null) return null;
  const asking =
    (setting === 'ask' && !downloaded) ||
    (setting === 'on' && !downloaded && metered && smart.status === 'idle');
  if (asking) {
    return (
      <Card className="my-2 flex flex-col gap-2">
        <p className="flex items-center gap-2 font-display font-extrabold">
          <Search className="size-5 text-accent" aria-hidden />
          {t('smart.title')}
        </p>
        <p className="text-sm text-muted">{t('smart.body', { size: formatNumber(EMBED_DOWNLOAD_MB) })}</p>
        {metered && <p className="text-sm font-semibold">{t('smart.mobileData')}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              void updateSetting('smartSearch', 'on');
              void embedDeck(deckId);
            }}
          >
            {t('smart.download', { size: formatNumber(EMBED_DOWNLOAD_MB) })}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void updateSetting('smartSearch', 'off')}>
            {t('smart.notNow')}
          </Button>
        </div>
      </Card>
    );
  }
  if (smart.status === 'downloading' && smart.total > 0) {
    return (
      <Card className="my-2 flex flex-col gap-2" aria-live="polite">
        <p className="text-sm font-semibold">
          {t('smart.downloading', { percent: formatPercent(smart.loaded / smart.total) })}
        </p>
        <ProgressBar value={smart.loaded / smart.total} label={t('smart.title')} />
      </Card>
    );
  }
  if (smart.status === 'error' && setting === 'on') {
    return <p className="my-2 rounded-2xl bg-surface-2 p-3 text-sm text-muted">{t('smart.failed')}</p>;
  }
  return null;
}
