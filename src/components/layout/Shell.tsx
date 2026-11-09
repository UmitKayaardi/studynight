import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Check, Globe, Home, RefreshCw, User, X } from 'lucide-react';
import { useApp } from '../../store/app';
import { LANGUAGES, languageInfo } from '../../i18n';
import { Logo } from '../art/Art';
import { Mascot } from '../art/Mascot';
import { Button, IconButton } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

export function LanguageMenu({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const language = useApp((s) => s.settings.language);
  const updateSetting = useApp((s) => s.updateSetting);
  const [open, setOpen] = useState(false);
  const current = languageInfo(language);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted hover:bg-surface-2"
        aria-label={t('language.menuLabel', { language: current.name })}
      >
        <Globe className="size-5" aria-hidden />
        {!compact && (
          <span lang={current.code} className="max-w-[7rem] truncate">
            {current.name}
          </span>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('language.choose')}>
        <ul className="grid grid-cols-1 gap-1 pb-2 sm:grid-cols-2">
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                lang={l.code}
                dir={l.dir}
                aria-pressed={l.code === current.code}
                onClick={() => {
                  void updateSetting('language', l.code);
                  setOpen(false);
                }}
                className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-start text-base ${l.code === current.code ? 'bg-accent-soft font-bold' : 'hover:bg-surface-2'}`}
              >
                <span className="flex-1">{l.name}</span>
                {l.code === current.code && <Check className="size-5 text-accent" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

const TABS = [
  { href: '/', icon: Home, key: 'nav.home' },
  { href: '/decks', icon: BookOpen, key: 'nav.decks' },
  { href: '/review', icon: RefreshCw, key: 'nav.review' },
  { href: '/profile', icon: User, key: 'nav.profile' },
] as const;

export function BottomTabs() {
  const { t } = useTranslation();
  const [location] = useLocation();
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-elevated/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ href, icon: Icon, key }) => {
          const active = href === '/' ? location === '/' : location.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-xs font-bold ${active ? 'text-accent' : 'text-muted'}`}
              >
                <Icon className="size-6" aria-hidden strokeWidth={active ? 2.6 : 2} />
                <span className="max-w-full truncate">{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Layout for the four main tabs: header with logo + language menu, content, bottom tabs. */
export function TabScreen({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh pb-24">
      <header className="mx-auto flex max-w-lg items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Link href="/" className="flex min-h-11 items-center gap-2" aria-label={`StudyNight – ${t('nav.home')}`}>
          <Logo size={34} />
          {!title && (
            // i18n-ignore: brand name
            <span className="font-display text-lg font-extrabold">StudyNight</span>
          )}
        </Link>
        {title && <h1 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold">{title}</h1>}
        {!title && <span className="flex-1" />}
        {actions}
        <LanguageMenu compact={!!title} />
      </header>
      <main id="main" className="mx-auto max-w-lg px-4">
        {children}
      </main>
      <BottomTabs />
    </div>
  );
}

/** Layout for secondary screens: back button + title, no tabs. */
export function SubScreen({
  title,
  children,
  back = '/',
  actions,
  onBack,
}: {
  title: string;
  children: ReactNode;
  back?: string;
  actions?: ReactNode;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  return (
    <div className="min-h-dvh pb-10">
      <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
          <IconButton label={t('common.back')} onClick={onBack ?? (() => navigate(back))}>
            <ArrowLeft className="size-6 rtl:-scale-x-100" aria-hidden />
          </IconButton>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-extrabold">{title}</h1>
          {actions}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-lg px-4">
        {children}
      </main>
    </div>
  );
}

export function Toasts() {
  const { t } = useTranslation();
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  useEffect(() => {
    const timers = toasts.map((x) => setTimeout(() => dismiss(x.id), x.duration ?? (x.action ? 7000 : 4000)));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.div
            key={x.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl px-4 py-2 shadow-card ${x.tone === 'error' ? 'bg-bad text-white dark:text-bg' : 'bg-text text-bg'}`}
          >
            <p className="min-w-0 flex-1 py-1 text-sm font-semibold">{x.message}</p>
            {x.action && (
              <button
                type="button"
                className="min-h-11 rounded-xl px-3 font-display font-extrabold underline-offset-2 hover:underline"
                onClick={() => {
                  x.action!.run();
                  dismiss(x.id);
                }}
              >
                {x.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label={t('common.close')}
              className="inline-flex size-11 items-center justify-center rounded-full"
              onClick={() => dismiss(x.id)}
            >
              <X className="size-4" aria-hidden />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ErrorFallback({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Mascot mood="surprised" size={140} />
      <h1 className="font-display text-2xl font-extrabold">{t('errors.boundary.title')}</h1>
      <p className="text-muted">{t('errors.boundary.body')}</p>
      <Button size="lg" onClick={onReset}>
        {t('common.goHome')}
      </Button>
    </main>
  );
}

/** Top-level error boundary. Data lives in IndexedDB, so going home never loses saved progress. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('StudyNight UI error', error.name, info.componentStack?.split('\n')[1]?.trim());
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <ErrorFallback
          onReset={() => {
            history.replaceState(null, '', '/');
            this.setState({ failed: false });
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        />
      );
    }
    return this.props.children;
  }
}
