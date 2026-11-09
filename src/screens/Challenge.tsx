import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { Swords } from 'lucide-react';
import { usePlay } from '../store/play';
import { parseChallenge } from '../lib/challenge';
import { Avatar, Logo } from '../components/art/Art';
import { Mascot } from '../components/art/Mascot';
import { Button } from '../components/ui/Button';
import { LanguageMenu } from '../components/layout/Shell';

/** Opens a challenge link (#c=…). No upload or account needed. Malformed links show a friendly error. */
export default function Challenge() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const start = usePlay((s) => s.start);
  const data = useMemo(() => parseChallenge(location.hash), []);

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <header className="flex items-center gap-2">
        <Logo size={32} />
        {/* i18n-ignore: brand name */}
        <span className="flex-1 font-display text-lg font-extrabold">StudyNight</span>
        <LanguageMenu />
      </header>
      {data ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <Avatar index={data.avatar} size={96} />
          <h1 className="font-display text-3xl font-extrabold">{t('challenge.from', { name: data.nickname || t('challenge.friend') })}</h1>
          <p className="text-lg">{t('challenge.theirScore', { correct: data.score, total: data.questions.length })}</p>
          <p className="text-sm text-muted">{t('challenge.forFun')}</p>
          <Button
            size="lg"
            icon={<Swords className="size-5" aria-hidden />}
            onClick={() => {
              void start({ mode: 'challenge', challenge: data });
              navigate('/play');
            }}
          >
            {t('challenge.accept')}
          </Button>
        </section>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center" role="alert">
          <Mascot mood="surprised" size={130} />
          <h1 className="font-display text-2xl font-extrabold">{t('errors.badChallenge.title')}</h1>
          <p className="text-muted">{t('errors.badChallenge.body')}</p>
          <Button onClick={() => navigate('/')}>{t('common.goHome')}</Button>
        </section>
      )}
    </main>
  );
}
