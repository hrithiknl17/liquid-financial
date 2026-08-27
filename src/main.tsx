import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import Root from './Root.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// Offline shell for the installed phone app. Dev keeps HMR untouched.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus; the app works fine without it.
    });
  });
}
