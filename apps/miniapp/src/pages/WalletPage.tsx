import { useCallback, useEffect, useState } from 'react';
import { TOPUP_MAX_STARS, TOPUP_MIN_STARS, TOPUP_PACKS, isTopupAmount } from '@app/shared';
import { api, type Wallet } from '../lib/api';
import { usePurchase } from '../lib/usePurchase';

/**
 * Кошелёк.
 *
 * Звёзды покупаются у Telegram и ложатся на баланс, а тратятся уже
 * внутри приложения — на показ анкеты и продвижение объявлений.
 *
 * История здесь не украшение и не «для полноты». Остаток на балансе —
 * это долг площадки перед человеком, и на вопрос «куда делись мои
 * звёзды» надо уметь ответить строкой, а не общими словами. Поэтому
 * рядом с каждой операцией показан и остаток после неё.
 */
export function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState('');

  // Пустая строка и число вне границ дают одно и то же — ноль,
  // и кнопка остаётся выключенной, пока сумму нельзя принять.
  const parsed = Number(custom);
  const customStars = isTopupAmount(parsed) ? parsed : 0;

  const load = useCallback(async () => {
    const fresh = await api.wallet();
    setWallet(fresh);
    return fresh;
  }, []);

  useEffect(() => {
    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Не удалось загрузить кошелёк'))
      .finally(() => setLoading(false));
  }, [load]);

  const balanceBefore = wallet?.balance ?? 0;
  const purchase = usePurchase(async () => {
    const fresh = await load();
    return fresh.balance > balanceBefore;
  });

  if (loading) return <div className="page" />;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">Кошелёк</div>
        <h1 className="hero__title">
          {balanceBefore} <span className="wallet__star">★</span>
        </h1>
        <p className="hero__subtitle">
          Звёздами оплачивается показ анкеты в каталоге и продвижение объявлений
        </p>
      </header>

      <div className="section-title">Пополнить</div>

      <div className="topup-grid">
        {TOPUP_PACKS.map((pack) => (
          <button
            key={pack.stars}
            type="button"
            className="topup"
            disabled={purchase.busy}
            onClick={() => void purchase.buy({ purpose: 'WALLET_TOPUP', stars: pack.stars })}
          >
            <span className="topup__amount">{pack.stars} ★</span>
            <span className="topup__hint">{pack.hint}</span>
          </button>
        ))}
      </div>

      {/*
        Своя сумма стоит после наборов, а не до них: набор отвечает на
        вопрос «сколько нужно» за человека, и предлагать сначала ввести
        число значило бы вернуть ему вопрос, ради которого наборы и
        сделаны. Тому, кто знает свою сумму, поле здесь не помешает.
      */}
      <form
        className="topup-custom"
        onSubmit={(event) => {
          event.preventDefault();
          if (customStars) void purchase.buy({ purpose: 'WALLET_TOPUP', stars: customStars });
        }}
      >
        <input
          className="form-input topup-custom__input"
          // inputMode подсказывает телефону цифровую клавиатуру, а type=text
          // оставляет поле управляемым: у type=number «e», «+» и точка
          // проходят внутрь, но читаются из него как пустая строка.
          type="text"
          inputMode="numeric"
          value={custom}
          placeholder="Своя сумма"
          onChange={(event) => setCustom(event.target.value.replace(/\D/g, '').slice(0, 5))}
          aria-label="Своя сумма пополнения в звёздах"
        />
        <button type="submit" className="button topup-custom__submit" disabled={!customStars || purchase.busy}>
          Пополнить
        </button>
      </form>

      <p className="form-hint">
        {custom && !customStars
          ? `Сумма — от ${TOPUP_MIN_STARS} до ${TOPUP_MAX_STARS} ★`
          : `Своя сумма — от ${TOPUP_MIN_STARS} до ${TOPUP_MAX_STARS} ★`}
      </p>

      {purchase.state === 'waiting' && <p className="form-hint">Оплата прошла, зачисляем…</p>}
      {purchase.state === 'done' && <p className="form-hint">Зачислено.</p>}
      {purchase.state === 'cancelled' && <p className="form-hint">Пополнение отменено.</p>}
      {(purchase.error || error) && <p className="form-error">{purchase.error ?? error}</p>}

      <div className="section-title">История</div>

      {wallet && wallet.entries.length > 0 ? (
        <div className="wallet-list">
          {wallet.entries.map((entry) => (
            <div key={entry.id} className="wallet-row">
              <span className="wallet-row__body">
                <span className="wallet-row__title">{entry.title}</span>
                <span className="wallet-row__date">
                  {new Date(entry.createdAt).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                  })}
                  {' · остаток '}
                  {entry.balanceAfter} ★
                </span>
              </span>
              <span className={`wallet-row__sum${entry.stars < 0 ? ' wallet-row__sum--out' : ''}`}>
                {entry.stars > 0 ? '+' : ''}
                {entry.stars} ★
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="state">
          <div className="state__icon">✨</div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>Пока пусто</div>
          <div style={{ marginTop: 6 }}>Пополните кошелёк — здесь появятся все движения</div>
        </div>
      )}

      <p className="onboarding__note">
        Звёзды — встроенная валюта Telegram. Отдельная карта не нужна, оплата проходит
        там же, где вы читаете этот текст.
      </p>
    </div>
  );
}
