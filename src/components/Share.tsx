import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Download, Share2 } from 'lucide-react';
import { db } from '../db/schema';
import { useApp } from '../store/app';
import { formatNumber, formatPercent } from '../lib/platform';
import { Logo } from './art/Art';
import { Mascot } from './art/Mascot';
import { Button } from './ui/Button';
import { Toggle } from './ui/Controls';
import { Sheet } from './ui/Sheet';

export interface ShareData {
  correct: number;
  total: number;
  accuracy: number;
  xp: number;
  title: string;
  deckId?: string;
}

/**
 * Shareable result card. It never contains note content — only the score, the session title and,
 * if the learner switches it on, the deck title.
 */
export function ShareSheet({ open, onClose, data }: { open: boolean; onClose: () => void; data: ShareData }) {
  const { t } = useTranslation();
  const toast = useApp((s) => s.toast);
  const profile = useApp((s) => s.profile);
  const [withDeck, setWithDeck] = useState(false);
  const [busy, setBusy] = useState(false);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const card = useRef<HTMLDivElement>(null);
  const deck = useLiveQuery(() => (data.deckId ? db.decks.get(data.deckId) : undefined), [data.deckId]);
  const text = withDeck && deck
    ? t('share.textDeck', { correct: data.correct, total: data.total, title: data.title, deck: deck.title })
    : t('share.text', { correct: data.correct, total: data.total, title: data.title });

  const png = async (): Promise<Blob | null> => {
    if (!card.current) return null;
    const { toBlob } = await import('html-to-image');
    return toBlob(card.current, { pixelRatio: 2, cacheBust: true });
  };

  const shareImage = async () => {
    setBusy(true);
    try {
      const blob = await png();
      if (!blob) return;
      const file = new File([blob], 'studynight-result.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      /* the learner closed the share dialog */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('share.title')}>
      <div className="flex flex-col gap-3 pb-2">
        <div ref={card} className="flex flex-col items-center gap-2 rounded-3xl bg-[#0b1026] p-6 text-center text-[#eef1ff]" dir="auto">
          <div className="flex items-center gap-2">
            <Logo size={28} />
            {/* i18n-ignore: brand name */}
            <span className="font-display font-extrabold">StudyNight</span>
          </div>
          <Mascot mood={data.accuracy >= 0.7 ? 'celebrating' : 'happy'} theme={profile?.mascotTheme ?? 0} size={96} />
          <p className="font-display text-4xl font-extrabold">{t('results.score', { correct: data.correct, total: data.total })}</p>
          <p className="text-sm text-[#aab2dc]">
            {formatPercent(data.accuracy)} · {t('results.xpValue', { xp: formatNumber(data.xp) })}
          </p>
          {data.title && <p className="rounded-full bg-[#ffc94d] px-3 py-1 font-display text-sm font-extrabold text-[#2b1d00]">{data.title}</p>}
          {withDeck && deck && <p className="text-sm text-[#aab2dc]">{deck.title}</p>}
        </div>
        {deck && <Toggle checked={withDeck} onChange={setWithDeck} label={t('share.includeDeck')} />}
        <Button block busy={busy} icon={canShare ? <Share2 className="size-5" aria-hidden /> : <Download className="size-5" aria-hidden />} onClick={() => void shareImage()}>
          {canShare ? t('share.shareImage') : t('share.download')}
        </Button>
        <Button
          block
          variant="secondary"
          icon={<Copy className="size-5" aria-hidden />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast({ message: t('share.copied'), tone: 'success' });
            } catch {
              toast({ message: text });
            }
          }}
        >
          {t('share.copyText')}
        </Button>
      </div>
    </Sheet>
  );
}
