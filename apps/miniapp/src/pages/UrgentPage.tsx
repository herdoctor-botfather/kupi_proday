import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UrgentRequest } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { ChipsRow } from '../components/ChipsRow';
import { CityInput } from '../components/CityInput';
import { haptic } from '../lib/telegram';

/** Время вызова человеческими словами: окно или крайний срок. */
export function when(request: UrgentRequest): string {
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

export const STATUS_VIEW: Record<UrgentRequest['status'], { icon: string; text: string }> = {
  OPEN: { icon: '📣', text: 'Мастера оповещены, ждём отклика' },
  TAKEN: { icon: '✅', text: 'Взял мастер' },
  EXPIRED: { icon: '🕘', text: 'Срок вышел, никто не взялся' },
  CANCELLED: { icon: '✖️', text: 'Вы отменили' },
};

/** Дни для своего окна: дальше послезавтра срочный вызов не назначают. */
const DAYS = ['Сегодня', 'Завтра', 'Послезавтра'];

/** Последний получасовой слот суток — 23:30, в минутах от полуночи. */
const LAST_SLOT = 23 * 60 + 30;

/** Ближайший будущий получасовой слот сегодня, в минутах от полуночи. */
function nextSlot(): number {
  const now = new Date();
  return Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30;
}

/** Сегодня выбирать уже нечего — окно по умолчанию ставим на завтра. */
const lateEvening = () => nextSlot() > LAST_SLOT - 30;

/** Получасовые слоты между двумя отметками включительно. */
function slots(from: number, to: number): number[] {
  const result: number[] = [];
  for (let value = from; value <= to; value += 30) result.push(value);
  return result;
}

/** 570 → «09:30». */
function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** «23 сент.» для дня через offset дней от сегодня. */
function dayLabel(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** Момент: день через offset от сегодня плюс минуты от полуночи, по местному времени. */
function atSlot(offset: number, minutes: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

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
  // Мастеру — вызовы его разделов и города: найти их можно не только в сообщении бота.
  const incoming = useAsync(() => api.incomingUrgent(), []);
  const navigate = useNavigate();

  const [categoryId, setCategoryId] = useState('');
  /** Список разделов свёрнут: раскрывается по нажатию, после выбора сворачивается. */
  const [whoOpen, setWhoOpen] = useState(false);
  const [city, setCity] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState(4);
  /** Человек назначает окно сам, а не выбирает из готовых сроков. */
  const [custom, setCustom] = useState(false);
  /*
   * Своё окно — день кнопкой и время списком, а не календарём.
   *
   * Раньше здесь стояли два поля «дата и время»: на телефоне они не
   * помещались в ширину, сдвигали страницу вбок и открывали громоздкий
   * календарь — ради выбора между «сегодня» и «завтра». Срочный вызов
   * дальше послезавтра не назначают, а время удобнее крутить колесом.
   */
  const [day, setDay] = useState(() => (lateEvening() ? 1 : 0));
  const [fromMin, setFromMin] = useState(() => (lateEvening() ? 9 * 60 : nextSlot()));
  const [toMin, setToMin] = useState(() => (lateEvening() ? 12 * 60 : Math.min(nextSlot() + 120, LAST_SLOT)));
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
              fromAt: atSlot(day, fromMin).toISOString(),
              toAt: atSlot(day, toMin).toISOString(),
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

      {/*
        Раздел — раскрывающимся списком, а не строкой чипов: в строку
        помещалось три раздела из двенадцати, остальные прятались за
        прокруткой вбок, и человек с потёкшей трубой их не находил.
        После выбора список сворачивается и показывает выбранное.
      */}
      <AsyncContent state={categories}>
        {(items) => {
          const chosen = items.find((category) => category.id === categoryId);
          return (
            <>
              <button
                type="button"
                className={`industry-toggle${whoOpen ? ' industry-toggle--open' : ''}`}
                aria-expanded={whoOpen}
                onClick={() => {
                  haptic.tap();
                  setWhoOpen((open) => !open);
                }}
              >
                <span>{chosen ? `${chosen.icon} ${chosen.name}` : 'Выберите, кто нужен'}</span>
                <span className="industry-toggle__side">
                  {whoOpen ? 'Свернуть' : chosen ? 'Изменить' : `${items.length} разделов`}
                  <span className="industry-toggle__arrow" aria-hidden>
                    ▾
                  </span>
                </span>
              </button>
              {whoOpen && (
                <div className="steps">
                  {items.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`step${categoryId === category.id ? ' step--active' : ''}`}
                      onClick={() => {
                        haptic.tap();
                        setCategoryId(category.id);
                        setWhoOpen(false);
                      }}
                    >
                      <span className="step__name">
                        {category.icon} {category.name}
                      </span>
                      <span className="step__side">
                        <span className="step__chevron" aria-hidden>
                          {categoryId === category.id ? '✓' : '›'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          );
        }}
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
        <>
          <ChipsRow>
            {DAYS.map((label, index) => (
              <button
                key={label}
                type="button"
                className={`chip${day === index ? ' chip--active' : ''}`}
                disabled={index === 0 && lateEvening()}
                onClick={() => {
                  haptic.tap();
                  setDay(index);
                  // На сегодня прошедшее время выбрать нельзя — подтягиваем окно.
                  if (index === 0 && fromMin < nextSlot()) {
                    setFromMin(nextSlot());
                    setToMin(Math.max(toMin, Math.min(nextSlot() + 120, LAST_SLOT)));
                  }
                }}
              >
                {label}, {dayLabel(index)}
              </button>
            ))}
          </ChipsRow>

          <div className="time-window">
            <label className="time-window__field">
              <span className="field__label">С</span>
              <select
                className="form-input"
                value={fromMin}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setFromMin(value);
                  if (toMin <= value) setToMin(Math.min(value + 60, LAST_SLOT));
                }}
              >
                {slots(day === 0 ? nextSlot() : 0, LAST_SLOT - 30).map((value) => (
                  <option key={value} value={value}>
                    {clock(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="time-window__field">
              <span className="field__label">До</span>
              <select
                className="form-input"
                value={toMin}
                onChange={(event) => setToMin(Number(event.target.value))}
              >
                {slots(fromMin + 30, LAST_SLOT).map((value) => (
                  <option key={value} value={value}>
                    {clock(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
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
          (custom && toMin <= fromMin)
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
                      {/* Вся строка открывает вызов: там статус, мастер и переписка. */}
                      <div
                        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          haptic.tap();
                          navigate(`/urgent/${request.id}`);
                        }}
                      >
                        <div className="my-listing__title">{request.title}</div>
                        <div className="card__headline">
                          {request.category.icon} {request.category.name} · {request.city}
                        </div>
                        <div className="card__headline">{when(request)}</div>
                        <div className="card__headline">
                          {view.icon} {view.text}
                          {request.takenBy ? `: ${request.takenBy.name}` : ''}
                        </div>
                        <div className="urgent-open">Открыть ›</div>
                      </div>
                      {request.status === 'OPEN' && (
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          // Своего размера: во всю ширину она выдавила бы текст вызова.
                          style={{ width: 'auto', flex: 'none', padding: '8px 14px' }}
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

      {(incoming.data?.length ?? 0) > 0 && (
        <>
          <h2 className="section-title">Вызовы для вас</h2>
          <div className="card-list">
            {incoming.data!.map((request) => (
              <button
                key={request.id}
                type="button"
                className="my-listing urgent-incoming"
                onClick={() => {
                  haptic.tap();
                  navigate(`/urgent/${request.id}`);
                }}
              >
                <div className="my-listing__title">{request.title}</div>
                <div className="card__headline">
                  {request.category.icon} {request.category.name} · {request.city}
                </div>
                <div className="card__headline">{when(request)}</div>
                <div className="urgent-open">
                  {request.status === 'OPEN' ? '⚡️ Открыть и взять ›' : 'Открыть ›'}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
