import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import { seedOnFirstRun } from './seed';
import { applyTheme } from './settings';

applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

if ('serviceWorker' in navigator) registerSW({ immediate: true });

// Ask the browser not to evict our IndexedDB data under storage pressure.
void navigator.storage?.persist?.();

void seedOnFirstRun().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
