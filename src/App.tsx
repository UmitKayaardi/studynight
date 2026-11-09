import { lazy, Suspense, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { Route, Switch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useApp } from './store/app';
import { applyTheme, onSystemThemeChange, reducedMotion } from './lib/platform';
import { ErrorBoundary, Toasts } from './components/layout/Shell';
import { Spinner } from './components/ui/Controls';

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
        <Suspense fallback={<Loading />}>
          <Switch>
            {Gallery && <Route path="/__gallery" component={Gallery} />}
            <Route>
              <Loading />
            </Route>
          </Switch>
        </Suspense>
        <Toasts />
      </ErrorBoundary>
    </MotionConfig>
  );
}
