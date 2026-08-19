import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles.css';

document.documentElement.dataset['theme'] = 'light';

const rootElement = document.querySelector<HTMLElement>('#root');

if (rootElement === null) {
  throw new Error('Missing #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
