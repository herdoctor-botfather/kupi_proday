import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ConversationSummary } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { ChipsRow } from '../components/ChipsRow';
import { haptic } from '../lib/telegram';
import { useAuth } from '../lib/auth';

/**
 * Раздел, к которому относится переписка.
 *
 * Разговор о мастере, о покупке вещи и о том, что человек ищет, — три
 * разных дела, и в общей куче они путаются: одинаковые имена, разные
 * поводы, и вспомнить, кто из «Иванов» про плиту, невозможно.
 */
type Section = 'all' | 'services' | 'selling' | 'wanted';

const SECTION_LABELS: Record<Section, string> = {
  all: 'Все',
  services: 'Услуги',
  selling: 'Продажа',
  wanted: 'Люди ищут',
};

const sectionOf = (conversation: ConversationSummary): Exclude<Section, 'all'> => {
  if (conversation.specialist) return 'services';
  return conversation.listing?.kind === 'BUY' ? 'wanted' : 'selling';
};

/** Список переписок — и как заказчика, и как специалиста. */
export function ChatsPage() {
  const { status } = useAuth();
  const conversations = useAsync(() => api.conversations(), []);
  const [section, setSection] = useState<Section>('all');

  if (status !== 'authenticated') {
    return (
      <div className="page">
        <h1 className="page__title">Сообщения</h1>
        <EmptyState
          icon="💬"
          title="Откройте приложение в Telegram"
          hint="Переписка доступна только внутри Telegram — оттуда приходят данные вашего профиля."
        />
      </div>
    );
  }

  const all = conversations.data ?? [];
  const counts = {
    all: all.length,
    services: all.filter((c) => sectionOf(c) === 'services').length,
    selling: all.filter((c) => sectionOf(c) === 'selling').length,
    wanted: all.filter((c) => sectionOf(c) === 'wanted').length,
  };

  return (
    <div className="page">
      <h1 className="page__title">Сообщения</h1>

      {/*
        Разделы показываем только тогда, когда переписок больше одной:
        фильтр над единственной строкой — это работа, которую человек
        делает вместо приложения.
      */}
      {all.length > 1 && (
        <ChipsRow>
          {(Object.keys(SECTION_LABELS) as Section[])
            // Пустые разделы не предлагаем: нажатие на них приведёт
            // к пустому экрану, а обещали список.
            .filter((key) => counts[key] > 0)
            .map((key) => (
              <button
                key={key}
                type="button"
                className={`chip${section === key ? ' chip--active' : ''}`}
                onClick={() => {
                  haptic.tap();
                  setSection(key);
                }}
              >
                {SECTION_LABELS[key]} {counts[key]}
              </button>
            ))}
        </ChipsRow>
      )}

      <AsyncContent state={conversations}>
        {(items) => {
          const shown = section === 'all' ? items : items.filter((c) => sectionOf(c) === section);

          if (items.length === 0) {
            return (
              <EmptyState
                icon="💬"
                title="Переписок пока нет"
                hint="Откройте карточку специалиста или объявление и нажмите «Написать» — общение идёт прямо здесь"
              />
            );
          }

          return (
            <div className="chat-list">
              {shown.map((conversation) => (
                <Link
                  key={conversation.id}
                  to={`/chat/${conversation.id}`}
                  className="chat-row"
                  onClick={() => haptic.tap()}
                >
                  {conversation.peer.photoUrl ? (
                    <img className="chat-row__avatar" src={conversation.peer.photoUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="chat-row__avatar" aria-hidden>
                      {conversation.peer.name.charAt(0)}
                    </div>
                  )}

                  <div className="chat-row__body">
                    <div className="chat-row__top">
                      <span className="chat-row__name">{conversation.peer.name}</span>
                      <span className="chat-row__time">{formatWhen(conversation.lastMessageAt)}</span>
                    </div>
                    <div className="chat-row__preview">
                      {conversation.lastMessageText ?? 'Нет сообщений'}
                    </div>
                    {/*
                      О чём разговор — теперь у каждой переписки, а не
                      только у владельца анкеты. Имена повторяются, поводы
                      разные, и без предмета вспомнить, кто из «Иванов»
                      про плиту, невозможно.
                    */}
                    <div className="chat-row__context">{subjectOf(conversation)}</div>
                  </div>

                  {conversation.unread > 0 && <span className="chat-row__badge">{conversation.unread}</span>}
                </Link>
              ))}
            </div>
          );
        }}
      </AsyncContent>
    </div>
  );
}

/** О чём переписка: анкета или конкретное объявление. */
function subjectOf(conversation: ConversationSummary): string {
  if (conversation.specialist) return `Услуги · ${conversation.specialist.displayName}`;
  if (!conversation.listing) return '';
  const prefix = conversation.listing.kind === 'BUY' ? 'Ищет' : 'Продажа';
  return `${prefix} · ${conversation.listing.title}`;
}

/**
 * Время последнего сообщения: сегодня — часы, на неделе — день недели,
 * дальше — дата. Полная дата у свежего сообщения читается хуже, чем «14:32».
 */
function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();

  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  const daysAgo = (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
  if (daysAgo < 7) {
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date);
  }

  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
}
