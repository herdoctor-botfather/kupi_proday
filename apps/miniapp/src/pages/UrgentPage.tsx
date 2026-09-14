import { useState } from 'react';
import type { UrgentRequest } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { ChipsRow } from '../components/ChipsRow';
import { CityInput } from '../components/CityInput';
import { haptic } from '../lib/telegram';

/** Насколько срочно. Часы, а не календарь: «до восьми» человек скажет охотнее. */
const HOURS = [
  { value: 2, label: 'В ближайшие 2 часа' },
  { value: 4, label: 'Сегодня, до 4 часов' },
  { value: 12, label: 'В течение дня' },
  { value: 24, label: 'До завтра' },
];

const STATUS_VIEW: Record<UrgentRequest['status'], { icon: string; text: string }> = {
  OPEN: { icon: '📣', text: 'Мастера оповещены, ждём отклика' },
  TAKEN: { icon: '✅', text: 'Взял мастер' },
  EXPIRED: { icon: '🕘', text: 'Срок вышел, никто не взялся' },
  CANCELLED: { icon: '✖️', text: 'Вы отменили' },
};

/**
 * «Надо срочно» — вызов мастера на сейчас.
 *
 * Когда прорвало трубу, выбирать из каталога некогда: нужен не лучший
 * мастер, а тот, кто приедет. Поэтому здесь нет списка и сравнения —
 * только описание беды и срок, а дальше вызов уходит всем подходящим
 * сразу, и берёт его первый согласившийся.
 */
export function UrgentPage() {
  const categories = useAsync(() => api.categories('SERVICE'), []);
  const mine = useAsync(() => api.myUrgent(), []);

  const [categoryId, setCategoryId] = useState('');
  const [city, setCity] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      haptic.tap();
      await api.createUrgent({
        categoryId,
        city: city.trim(),
        title: title.trim(),
        description: description.trim() || null,
        hours,
      });
      haptic.success();
      setTitle('');
      setDescription('');
      mine.reload();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось позвать мастеров');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    haptic.tap();
    await api.cancelUrgent(id).catch(() => {});
    mine.reload();
  };

  return (
    <div className="page">
      <h1 className="page__title">⚡️ Надо срочно</h1>

      <p className="form-hint" style={{ marginTop: 0 }}>
        Вызов уйдёт сразу всем подходящим мастерам вашего города. Возьмёт тот,
        кто первым согласится, — и вы сразу окажетесь с ним в переписке.
      </p>

      <h2 className="section-title">Кто нужен</h2>

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
                  setCategoryId(category.id);
                }}
              >
                {category.icon} {category.name}
              </button>
            ))}
          </ChipsRow>
        )}
      </AsyncContent>

      <div className="field">
        <span className="field__label">Что случилось</span>
        <input
          className="form-input"
          value={title}
          maxLength={160}
          placeholder="Например: течёт труба под раковиной"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="field">
        <span className="field__label">Подробности</span>
        <textarea
          className="form-input form-textarea"
          value={description}
          maxLength={1000}
          placeholder="Этаж, подъезд, что уже пробовали — всё, что сэкономит время"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="field">
        <span className="field__label">Город</span>
        <CityInput value={city} onChange={setCity} placeholder="Где нужна помощь" />
      </div>

      <h2 className="section-title">Насколько срочно</h2>

      <ChipsRow>
        {HOURS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`chip${hours === option.value ? ' chip--active' : ''}`}
            onClick={() => {
              haptic.tap();
              setHours(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </ChipsRow>

      {error && <p className="form-error">{error}</p>}

      <button
        type="button"
        className="button"
        disabled={busy || !categoryId || title.trim().length < 5 || city.trim().length < 2}
        onClick={() => void send()}
      >
        {busy ? 'Зовём мастеров...' : '⚡️ Позвать мастеров'}
      </button>

      <h2 className="section-title">Мои вызовы</h2>

      <AsyncContent state={mine}>
        {(items) =>
          items.length === 0 ? (
            <p className="form-hint">Пока ни одного.</p>
          ) : (
            <div className="card-list">
              {items.map((request) => {
                const view = STATUS_VIEW[request.status];
                return (
                  <div key={request.id} className="my-listing">
                    <div className="my-listing__head">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="my-listing__title">{request.title}</div>
                        <div className="card__headline">
                          {request.category.icon} {request.category.name} · {request.city}
                        </div>
                        <div className="card__headline">
                          {view.icon} {view.text}
                          {request.takenBy ? `: ${request.takenBy.name}` : ''}
                        </div>
                      </div>
                      {request.status === 'OPEN' && (
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          onClick={() => void cancel(request.id)}
                        >
                          Отменить
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </AsyncContent>
    </div>
  );
}
