import { useState } from 'react';
import type { UrgentRequest } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { ChipsRow } from '../components/ChipsRow';
import { CityInput } from '../components/CityInput';
import { haptic } from '../lib/telegram';

/** Время вызова человеческими словами: окно или крайний срок. */
function when(request: UrgentRequest): string {
  const clock = (value: string) =>
    new Date(value).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return request.neededFrom
    ? `с ${clock(request.neededFrom)} до ${clock(request.neededBy)}`
    : `до ${clock(request.neededBy)}`;
}

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
  /** Человек назначает окно сам, а не выбирает из готовых сроков. */
  const [custom, setCustom] = useState(false);
  const [fromAt, setFromAt] = useState('');
  const [toAt, setToAt] = useState('');
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
        // Своё время отправляем готовыми моментами: часовой пояс знает
        // браузер, и пересчитывать его на сервере значит однажды назначить
        // встречу на три часа ночи.
        ...(custom
          ? {
              fromAt: fromAt ? new Date(fromAt).toISOString() : undefined,
              toAt: new Date(toAt).toISOString(),
            }
          : { hours }),
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

      <h2 className="section-title">Когда нужно</h2>

      <ChipsRow>
        {HOURS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`chip${!custom && hours === option.value ? ' chip--active' : ''}`}
            onClick={() => {
              haptic.tap();
              setCustom(false);
              setHours(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
        {/*
          Своё окно — для тех, у кого срочность не в минутах, а в попадании
          в промежуток: «буду дома с двух до шести». Готовые кнопки такому
          человеку не подходят, а без своего времени он не вызовет никого.
        */}
        <button
          type="button"
          className={`chip${custom ? ' chip--active' : ''}`}
          onClick={() => {
            haptic.tap();
            setCustom(true);
          }}
        >
          Своё время
        </button>
      </ChipsRow>

      {custom && (
        <div className="form-row">
          <div className="field">
            <span className="field__label">С</span>
            <input
              className="form-input"
              type="datetime-local"
              value={fromAt}
              onChange={(event) => setFromAt(event.target.value)}
            />
          </div>
          <div className="field">
            <span className="field__label">До</span>
            <input
              className="form-input"
              type="datetime-local"
              value={toAt}
              onChange={(event) => setToAt(event.target.value)}
            />
          </div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <button
        type="button"
        className="button"
        disabled={
          busy ||
          !categoryId ||
          title.trim().length < 5 ||
          city.trim().length < 2 ||
          // Своё время выбрано, но не заполнено: кнопка, которая заведомо
          // откажет, хуже недоступной.
          (custom && !toAt)
        }
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
                        <div className="card__headline">{when(request)}</div>
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
