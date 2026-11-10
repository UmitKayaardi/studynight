import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useApp } from '../store/app';

/** Shows "A new version is ready — Refresh" when an updated service worker is waiting. */
export function UpdateToast() {
  const { t } = useTranslation();
  const toast = useApp((s) => s.toast);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  useEffect(() => {
    if (needRefresh) {
      toast({
        message: t('pwa.update'),
        duration: 60_000,
        action: { label: t('pwa.refresh'), run: () => void updateServiceWorker(true) },
      });
    }
  }, [needRefresh, t, toast, updateServiceWorker]);
  return null;
}
