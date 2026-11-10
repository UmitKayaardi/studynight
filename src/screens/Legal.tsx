import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import licences from '../legal/licences.json';
import { SubScreen } from '../components/layout/Shell';
import { Logo } from '../components/art/Art';
import { Mascot } from '../components/art/Mascot';
import { Card } from '../components/ui/Controls';
import { formatDate } from '../lib/platform';

/** Date the Groq data terms were last checked and these pages were last updated. */
export const LEGAL_UPDATED = '2026-11-09';
export const APP_VERSION = '1.0.0';

function Sections({ prefix, count }: { prefix: string; count: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 py-3">
      {Array.from({ length: count }, (_, i) => (
        <section key={i}>
          <h2 className="mb-1 font-display text-lg font-extrabold">{t(`${prefix}.s${i + 1}.h`)}</h2>
          <p className="whitespace-pre-line leading-relaxed">{t(`${prefix}.s${i + 1}.p`)}</p>
        </section>
      ))}
    </div>
  );
}

/** Legal pages can be opened from anywhere (or directly by URL): go back if possible, otherwise home. */
function useBack() {
  const [, navigate] = useLocation();
  return () => (history.length > 1 ? history.back() : navigate('/'));
}

export function Privacy() {
  const { t } = useTranslation();
  const back = useBack();
  return (
    <SubScreen title={t('legal.privacy')} onBack={back}>
      <p className="pt-2 text-sm text-muted">
        {t('legal.updated', {
          date: formatDate(LEGAL_UPDATED, { day: 'numeric', month: 'long', year: 'numeric' }),
        })}
      </p>
      <Sections prefix="privacy" count={10} />
    </SubScreen>
  );
}

export function Terms() {
  const { t } = useTranslation();
  const back = useBack();
  return (
    <SubScreen title={t('legal.terms')} onBack={back}>
      <p className="pt-2 text-sm text-muted">
        {t('legal.updated', {
          date: formatDate(LEGAL_UPDATED, { day: 'numeric', month: 'long', year: 'numeric' }),
        })}
      </p>
      <Sections prefix="terms" count={9} />
    </SubScreen>
  );
}

export function About() {
  const { t } = useTranslation();
  const back = useBack();
  return (
    <SubScreen title={t('legal.about')} onBack={back}>
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <Logo size={64} />
        {/* i18n-ignore: brand name */}
        <p className="font-display text-2xl font-extrabold">StudyNight</p>
        <p className="text-muted">{t('app.tagline')}</p>
        <p className="text-sm text-muted">{t('about.version', { version: APP_VERSION })}</p>
      </div>
      <Card className="flex flex-col gap-3">
        <p className="font-display text-lg font-extrabold">{t('about.principleTitle')}</p>
        <p>{t('about.principle')}</p>
      </Card>
      <Card className="mt-3 flex items-center gap-3">
        <Mascot mood="happy" size={72} />
        <p className="text-sm">{t('about.mascot')}</p>
      </Card>
      <p className="mt-4 text-sm text-muted">{t('about.credits')}</p>
      <p className="mt-2 text-sm text-muted">{t('about.copyright')}</p>
    </SubScreen>
  );
}

export function Licences() {
  const { t } = useTranslation();
  const back = useBack();
  return (
    <SubScreen title={t('legal.licences')} onBack={back}>
      <p className="py-2 text-muted">{t('licences.intro')}</p>
      <Card className="mb-3 flex flex-col gap-1">
        <p className="font-display font-extrabold">{t('licences.model')}</p>
        <p className="text-sm sn-ltr">
          {licences.model.name} — {licences.model.licence}
        </p>
        <p className="text-sm text-muted">{t('licences.fonts')}</p>
        <p className="text-sm text-muted">{t('licences.original')}</p>
      </Card>
      <ul
        className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface text-sm"
        dir="ltr"
      >
        {licences.packages.map((p) => (
          <li key={p.name} className="flex justify-between gap-2 px-3 py-2">
            <span className="min-w-0 truncate">
              {p.name} <span className="text-muted">{p.version}</span>
            </span>
            <span className="shrink-0 font-semibold">{p.licence}</span>
          </li>
        ))}
      </ul>
    </SubScreen>
  );
}
