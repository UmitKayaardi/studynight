import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Share2 } from 'lucide-react';
import { useApp } from '../store/app';
import { usePlay } from '../store/play';
import { createChallengeLink } from '../lib/challenge';
import { bumpStat } from '../lib/game/record';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

/** Creates a challenge link from the session just played (no server: everything is in the link's #fragment). */
export function ChallengeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useApp((s) => s.toast);
  const profile = useApp((s) => s.profile);
  const s = usePlay();
  const link = useMemo(() => {
    const results = s.items
      .map((item) => ({ item, a: s.answers.find((x) => x.itemId === item.id && !x.reported) }))
      .filter((r) => r.a)
      .map((r) => ({ content: r.item.content, correct: r.a!.correct }));
    return createChallengeLink(location.origin, { nickname: profile?.nickname ?? '', avatar: profile?.avatar ?? 0, results });
  }, [s.items, s.answers, profile]);

  const text = t('challenge.shareText', { name: profile?.nickname || t('challenge.friend') });
  const sent = async () => {
    const badges = await bumpStat('challengesSent');
    if (badges.length) toast({ message: t('badges.earned', { name: t(`badges.${badges[0]}.name`) }), tone: 'success' });
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('modes.challenge')}>
      <div className="flex flex-col gap-3 pb-2">
        {link ? (
          <>
            <p>{t('challenge.intro', { count: link.count })}</p>
            <p className="text-sm text-muted">{t('challenge.privacy')}</p>
            {'share' in navigator && (
              <Button
                block
                icon={<Share2 className="size-5" aria-hidden />}
                onClick={async () => {
                  try {
                    await navigator.share({ url: link.url, text });
                    void sent();
                  } catch {
                    /* closed */
                  }
                }}
              >
                {t('challenge.share')}
              </Button>
            )}
            <Button
              block
              variant="secondary"
              icon={<Copy className="size-5" aria-hidden />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  toast({ message: t('challenge.copied'), tone: 'success' });
                  void sent();
                } catch {
                  toast({ message: link.url });
                }
              }}
            >
              {t('challenge.copy')}
            </Button>
            <p className="text-xs text-muted">{t('challenge.forFun')}</p>
          </>
        ) : (
          <p>{t('challenge.none')}</p>
        )}
      </div>
    </Sheet>
  );
}
