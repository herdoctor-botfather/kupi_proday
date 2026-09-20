import { useState } from 'react';
import type { CategoryKind, DemandWatch } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { ChipsRow } from '../components/ChipsRow';
import { CityInput } from '../components/CityInput';
import { haptic } from '../lib/telegram';

/**
 * Охота за спросом.
 *
 * Человек говорит один раз, что ему интересно, — и получает уведомление,
 * когда кто-то разместил подходящий запрос. Это переворачивает работу
 * площадки: не он ходит по витрине в поисках клиента, а спрос приходит
 * к нему сам.
 *
 * Работает там, где витрина ещё не работает: витрине нужен объём, а
 * уведомление полезно и при десяти объявлениях в неделю.
 */
export function DemandWatchPage() {
  const watches = useAsync(() => api.demandWatches(), []);
  const [kind, setKind] = useState<CategoryKind>('PRODUCT');
  const categories = useAsync(() => api.categories(kind), [kind]);

  const [categoryId, setCategoryId] = useState<string>('');
  const [city, setCity] = useState('');
  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      haptic.tap();
      await api.addDemandWatch({
        // Караулят вещи и услуги: вакансии смотрят сами, когда нужна работа.
        kind: kind === 'PRODUCT' ? 'PRODUCT' : 'SERVICE',
        categoryId: categoryId || null,
        city: city.trim() || null,
        keyword: keyword.trim() || null,
      });
      haptic.success();
      setCategoryId('');
      setKeyword('');
      watches.reload();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось подписаться');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    haptic.tap();
    await api.removeDemandWatch(id).catch(() => {});
    watches.reload();
  };

  return (
    <div className="page">
      <h1 className="page__title">Когда кто-то ищет</h1>

      <p className="form-hint" style={{ marginTop: 0 }}>
        Скажите, что вам интересно, — и мы напишем, как только появится подходящий
        запрос. Не вы ищете клиента, а он находит вас.
      </p>

      <h2 className="section-title">Подписаться</h2>

      <ChipsRow>
        {(['PRODUCT', 'SERVICE'] as CategoryKind[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`chip${kind === value ? ' chip--active' : ''}`}
            onClick={() => {
              haptic.tap();
              setKind(value);
              setCategoryId('');
            }}
          >
            {value === 'PRODUCT' ? 'Ищут вещи' : 'Ищут мастера'}
          </button>
        ))}
      </ChipsRow>

      <AsyncContent state={categories}>
        {(items) => (
          <ChipsRow>
            {items.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`chip${categoryId === category.id ? ' chip--active' : ''}`}
                onClick={() => {
                  haptic.tap();
                  setCategoryId(categoryId === category.id ? '' : category.id);
                }}
              >
                {category.icon} {category.name}
              </button>
            ))}
          </ChipsRow>
        )}
      </AsyncContent>

      <div className="field">
        <span className="field__label">Город</span>
        <CityInput value={city} onChange={setCity} placeholder="Любой" />
      </div>

      <div className="field">
        <span className="field__label">Слово в запросе</span>
        <input
          className="form-input"
          value={keyword}
          maxLength={60}
          placeholder="Например: велосипед"
          onChange={(event) => setKeyword(event.target.value)}
        />
        <span className="field__hint">
          Точнее категории: «велосипед» вместо всего спорта
        </span>
      </div>

      {error && <p className="form-error">{error}</p>}

      <button type="button" className="button" disabled={busy} onClick={() => void add()}>
        {busy ? 'Подписываем...' : 'Сообщать мне о таком'}
      </button>

      <h2 className="section-title">Мои подписки</h2>

      <AsyncContent state={watches}>
        {(items) =>
          items.length === 0 ? (
            <p className="form-hint">Пока ни одной. Добавьте выше — и запросы начнут приходить сами.</p>
          ) : (
            <div className="card-list">
              {items.map((watch) => (
                <div key={watch.id} className="my-listing">
                  <div className="my-listing__head">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="my-listing__title">{describe(watch)}</div>
                      <div className="card__headline">
                        {watch.kind === 'PRODUCT' ? 'Запросы на вещи' : 'Запросы на услуги'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button button--secondary button--sm"
                      style={{ color: 'var(--destructive)' }}
                      onClick={() => void remove(watch.id)}
                    >
                      Убрать
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </AsyncContent>
    </div>
  );
}

/** Человеческое название подписки: из чего она составлена. */
function describe(watch: DemandWatch): string {
  const parts = [
    watch.category ? `${watch.category.icon} ${watch.category.name}` : null,
    watch.keyword ? `«${watch.keyword}»` : null,
    watch.city,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : 'Всё подряд';
}
