import { lazy, Suspense, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { Route, Switch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useApp } from './store/app';
import { applyTheme, onSystemThemeChange, reducedMotion } from './lib/platform';
import { ErrorBoundary, Toasts } from './components/layout/Shell';
import { Spinner } from './components/ui/Controls';
import Home from './screens/Home';

const Onboarding = lazy(() => import('./screens/Onboarding'));
const Decks = lazy(() => import('./screens/Decks'));
const Samples = lazy(() => import('./screens/Samples'));
const NewDeck = lazy(() => import('./screens/NewDeck'));
const Deck = lazy(() => import('./screens/Deck'));
const Play = lazy(() => import('./screens/Play'));
const Results = lazy(() => import('./screens/Results'));
const Challenge = lazy(() => import('./screens/Challenge'));
const Gallery = import.meta.env.DEV ? lazy(() => import('./screens/dev/Gallery')) : null;

function Loading() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label={t('common.loading')} />
    </div>
  );
}

export function App() {
  const settings = useApp((s) => s.settings);
  useEffect(() => onSystemThemeChange(() => applyTheme(settings.theme)), [settings.theme]);
  const reduce = settings.reducedMotion ?? reducedMotion();
  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
      <ErrorBoundary>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[70] focus:rounded-xl focus:bg-surface focus:p-3">
          {/* skip link label is set from translations below */}
          <SkipLabel />
        </a>
        <Suspense fallback={<Loading />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/welcome" component={Onboarding} />
            <Route path="/decks" component={Decks} />
            <Route path="/samples" component={Samples} />
            <Route path="/new" component={NewDeck} />
            <Route path="/deck/:id" component={Deck} />
            <Route path="/play" component={Play} />
            <Route path="/results" component={Results} />
            <Route path="/challenge" component={Challenge} />
            {Gallery && <Route path="/__gallery" component={Gallery} />}
            <Route component={Home} />
          </Switch>
        </Suspense>
        <Toasts />
      </ErrorBoundary>
    </MotionConfig>
  );
}

function SkipLabel() {
  const { t } = useTranslation();
  return <>{t('common.skipToContent')}</>;
}
