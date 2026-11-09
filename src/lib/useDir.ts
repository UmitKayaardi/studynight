import { useTranslation } from 'react-i18next';

/** Text direction of the current UI language ('rtl' for Arabic, Persian, Urdu). */
export function useDocumentDir(): 'ltr' | 'rtl' {
  const { i18n } = useTranslation();
  return i18n.dir(i18n.language) === 'rtl' ? 'rtl' : 'ltr';
}
