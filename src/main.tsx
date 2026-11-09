import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito';
import '@fontsource-variable/inter';
import './styles.css';
import { initI18n } from './i18n';
import { useApp } from './store/app';
import { App } from './App';

async function start() {
  await initI18n('en');
  await useApp.getState().boot();
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

void start();
