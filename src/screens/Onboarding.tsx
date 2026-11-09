import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BookOpenCheck, Sparkles, Upload } from 'lucide-react';
import { useApp } from '../store/app';
import { Mascot, type MascotMood } from '../components/art/Mascot';
import { Avatar, AVATAR_COUNT, Logo } from '../components/art/Art';
import { Button } from '../components/ui/Button';
import { Segmented, TextField } from '../components/ui/Controls';
import { LanguageMenu } from '../components/layout/Shell';
import { DAILY_GOALS, type DailyGoal } from '../lib/learning/xp';

const INTRO: Array<{ mood: MascotMood; key: string }> = [
  { mood: 'happy', key: 'one' },
  { mood: 'thinking', key: 'two' },
  { mood: 'celebrating', key: 'three' },
];

export default function Onboarding() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const profile = useApp((s) => s.profile);
  const saveProfile = useApp((s) => s.saveProfile);
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? 0);
  const [goal, setGoal] = useState<DailyGoal>(profile?.dailyGoalMinutes ?? 10);

  const finish = async (to: string) => {
    await saveProfile({ nickname: nickname.trim().slice(0, 24), avatar, dailyGoalMinutes: goal, onboarded: true });
    navigate(to);
  };

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2">
        <Logo size={32} />
        {/* i18n-ignore: brand name */}
        <span className="flex-1 font-display text-lg font-extrabold">StudyNight</span>
        <LanguageMenu />
      </header>

      <AnimatePresence mode="wait">
        {step < INTRO.length ? (
          <motion.section
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
            aria-live="polite"
          >
            <Mascot mood={INTRO[step]!.mood} size={180} />
            <h1 className="font-display text-3xl font-extrabold leading-tight">{t(`onboarding.${INTRO[step]!.key}.title`)}</h1>
            <p className="max-w-sm text-lg text-muted">{t(`onboarding.${INTRO[step]!.key}.body`)}</p>
          </motion.section>
        ) : (
          <motion.section key="setup" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} className="flex flex-1 flex-col gap-5 py-6">
            <h1 className="font-display text-2xl font-extrabold">{t('onboarding.setup.title')}</h1>
            <TextField
              label={t('onboarding.setup.nickname')}
              hint={t('onboarding.setup.nicknameHint')}
              value={nickname}
              maxLength={24}
              autoComplete="nickname"
              onChange={(e) => setNickname(e.target.value)}
            />
            <fieldset>
              <legend className="mb-2 font-semibold">{t('onboarding.setup.avatar')}</legend>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" role="radiogroup" aria-label={t('onboarding.setup.avatar')}>
                {Array.from({ length: AVATAR_COUNT }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={avatar === i}
                    aria-label={t('onboarding.setup.avatarN', { n: i + 1 })}
                    onClick={() => setAvatar(i)}
                    className={`flex aspect-square items-center justify-center rounded-2xl border-2 ${avatar === i ? 'border-accent bg-accent-soft' : 'border-transparent bg-surface-2'}`}
                  >
                    <Avatar index={i} size={44} />
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <p className="mb-2 font-semibold" id="goal-label">
                {t('onboarding.setup.goal')}
              </p>
              <Segmented
                label={t('onboarding.setup.goal')}
                value={goal}
                onChange={setGoal}
                options={DAILY_GOALS.map((g) => ({ value: g, label: t('common.minutes', { count: g }) }))}
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <footer className="flex flex-col gap-3">
        {step < INTRO.length ? (
          <>
            <div className="mb-1 flex justify-center gap-2" aria-hidden>
              {INTRO.map((_, i) => (
                <span key={i} className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-accent' : 'w-2 bg-surface-2'}`} />
              ))}
            </div>
            <Button size="lg" block onClick={() => setStep(step + 1)} icon={<ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden />}>
              {t('common.next')}
            </Button>
            <Button variant="ghost" block onClick={() => setStep(INTRO.length)}>
              {t('common.skip')}
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" block icon={<Upload className="size-5" aria-hidden />} onClick={() => void finish('/new')}>
              {t('onboarding.uploadNotes')}
            </Button>
            <Button size="lg" variant="secondary" block icon={<Sparkles className="size-5" aria-hidden />} onClick={() => void finish('/samples')}>
              {t('onboarding.trySample')}
            </Button>
            <Button variant="ghost" block icon={<BookOpenCheck className="size-5" aria-hidden />} onClick={() => void finish('/')}>
              {t('onboarding.later')}
            </Button>
          </>
        )}
      </footer>
    </main>
  );
}
