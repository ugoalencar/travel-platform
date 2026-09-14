import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { installAuthFetch } from './lib/installAuthFetch';
import './index.css';

// Must run before any page's fetch('/api/...') call (Frontend Auth &
// Session track) -- see installAuthFetch.ts for why this wraps the global
// fetch instead of touching every page's call sites.
installAuthFetch();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
