import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initTelegram } from './lib/telegram';
import './styles/global.css';

// SDK Telegram инициализируется до первого рендера: тема применяется сразу,
// иначе на старте мелькает светлое оформление в тёмном клиенте.
initTelegram();

const container = document.getElementById('root');
if (!container) throw new Error('Не найден корневой элемент #root');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
