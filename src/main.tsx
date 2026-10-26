import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { seedOnFirstRun } from './seed';
import { applyFontStyle } from './lib/fonts';
import { initUpdates } from './lib/updates';
import { applyTheme, getSettings } from './settings';

applyTheme();
applyFontStyle(getSettings().font);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

initUpdates();

// Ask the browser not to evict our IndexedDB data under storage pressure.
void navigator.storage?.persist?.();

void seedOnFirstRun().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
