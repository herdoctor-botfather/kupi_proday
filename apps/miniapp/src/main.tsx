import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initTelegram } from './lib/telegram';
import './styles/global.css';

// SDK Telegram инициализируется до первого рендера: тема применяется сразу,
// иначе на старте мелькает светлое оформление в тёмном клиенте.
//
// Но раз этот вызов стоит перед render, любое исключение внутри него
// оставит пользователя с пустым экраном вместо приложения. Версий клиента
// много, и какие методы в них есть — нам заранее не известно, поэтому
// неудачная настройка оформления не должна мешать приложению открыться.
try {
  initTelegram();
} catch (err) {
  console.error('Не удалось настроить Telegram SDK', err);
}

const container = document.getElementById('root');
if (!container) throw new Error('Не найден корневой элемент #root');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
