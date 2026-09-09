import { useCallback, useEffect, useState } from 'react';
import { SPECIALIST_PLANS, SPECIALIST_PLAN_IDS, type MySpecialistProfile } from '@app/shared';
import { api } from '../lib/api';
import { usePurchase } from '../lib/usePurchase';

/**
 * Подписка специалиста.
 *
 * Анкету можно завести и держать бесплатно — платным является показ:
 * пока подписка жива, анкета видна в каталоге и на карте. Это и есть
 * то, за чем специалист сюда приходит, поэтому цена привязана именно
 * к показу, а не к самому факту существования анкеты.
 */
export function SubscriptionPage() {
  const [profile, setProfile] = useState<MySpecialistProfile | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    // Кошелёк тянем вместе с анкетой: от остатка зависит сам способ
    // оплаты, и узнавать его после нажатия было бы поздно.
    const [fresh, wallet] = await Promise.all([api.myProfile(), api.wallet().catch(() => null)]);
    setProfile(fresh);
    if (wallet) setBalance(wallet.balance);
    return fresh;
  }, []);

  useEffect(() => {
    load()
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить'))
      .finally(() => setLoading(false));
  }, [load]);

  // Купленным считаем не ответ Telegram, а появившийся на сервере срок:
  // выдаёт подписку сервер, и до его подтверждения показывать её нельзя.
  const previousEnd = profile?.subscriptionEndsAt ?? null;
  const { state, error, buy, busy } = usePurchase(async () => {
    const fresh = await load();
    return Boolean(fresh?.subscriptionEndsAt) && fresh?.subscriptionEndsAt !== previousEnd;
  });

  const [balanceError, setBalanceError] = useState<string | null>(null);

  /**
   * Хватает на балансе — списываем оттуда, не хватает — платим звёздами
   * напрямую. Спрашивать человека, каким из двух способов он хочет
   * заплатить одну и ту же сумму, значит перекладывать на него выбор,
   * у которого нет последствий.
   */
  const pay = async (plan: string, price: number) => {
    setBalanceError(null);
    if (balance < price) {
      void buy({ purpose: 'SPECIALIST_SUBSCRIPTION', plan });
      return;
    }

    setPaying(true);
    try {
      const { balance: left } = await api.payFromBalance({ purpose: 'SPECIALIST_SUBSCRIPTION', plan });
      setBalance(left);
      await load();
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : 'Не удалось списать с баланса');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="page" />;

  if (loadError || !profile) {
    return (
      <div className="page">
        <h1 className="page__title">Подписка</h1>
        <div className="state">
          <div className="state__icon">🧾</div>
          <div>{loadError ?? 'Сначала заполните анкету специалиста'}</div>
        </div>
      </div>
    );
  }

  const activeUntil = profile.subscriptionEndsAt ? new Date(profile.subscriptionEndsAt) : null;
  const isActive = activeUntil !== null && activeUntil > new Date();

  return (
    <div className="page">
      <h1 className="page__title">Подписка</h1>

      <div className="subscription-state">
        {isActive ? (
          <>
            <div className="subscription-state__title">Анкета показывается</div>
            <div className="subscription-state__hint">
              Оплачено до {activeUntil.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}.
              Продлить можно заранее — оставшиеся дни не сгорят, новый срок добавится к ним.
            </div>
          </>
        ) : (
          <>
            <div className="subscription-state__title">Анкета скрыта из каталога</div>
            <div className="subscription-state__hint">
              Она никуда не делась: услуги, фотографии и отзывы на месте. Но найти вас через каталог
              и карту сейчас нельзя — для этого нужна подписка.
            </div>
          </>
        )}
      </div>

      <div className="section-title">{isActive ? 'Продлить' : 'Выбрать срок'}</div>

      <div className="plan-list">
        {SPECIALIST_PLAN_IDS.map((id) => {
          const plan = SPECIALIST_PLANS[id];
          // Цена за день показывает выгоду длинного тарифа честнее,
          // чем скидка в процентах: её не нужно ни с чем сравнивать.
          const perDay = Math.round(plan.stars / plan.days);
          return (
            <button
              key={id}
              type="button"
              className="plan"
              disabled={busy || paying}
              onClick={() => void pay(id, plan.stars)}
            >
              <span className="plan__title">{plan.title}</span>
              <span className="plan__price">{plan.stars} ★</span>
              <span className="plan__note">
                примерно {perDay} ★ в день
                {balance >= plan.stars ? ' · спишется с баланса' : ''}
              </span>
            </button>
          );
        })}
      </div>

      <p className="form-hint">На балансе: {balance} ★</p>

      {paying && <p className="form-hint">Списываем с баланса…</p>}
      {balanceError && <p className="form-error">{balanceError}</p>}
      {state === 'waiting' && <p className="form-hint">Оплата прошла, применяем…</p>}
      {state === 'done' && <p className="form-hint">Готово. Анкета снова в каталоге.</p>}
      {state === 'cancelled' && <p className="form-hint">Оплата отменена.</p>}
      {error && <p className="form-error">{error}</p>}

      <p className="onboarding__note">
        Оплата проходит звёздами Telegram — это встроенный способ, отдельная карта не нужна.
      </p>
    </div>
  );
}
