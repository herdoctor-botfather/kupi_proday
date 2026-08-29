import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { haptic } from '../lib/telegram';
import { useAuth } from '../lib/auth';

/** Список переписок — и как заказчика, и как специалиста. */
export function ChatsPage() {
  const { status } = useAuth();
  const conversations = useAsync(() => api.conversations(), []);

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

  return (
    <div className="page">
      <h1 className="page__title">Сообщения</h1>

      <AsyncContent state={conversations}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState
              icon="💬"
              title="Переписок пока нет"
              hint="Откройте карточку специалиста и нажмите «Написать» — общение идёт прямо здесь"
            />
          ) : (
            <div className="chat-list">
              {items.map((conversation) => (
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
                    {/* Владельцу полезно помнить, о чём речь: анкета
                        или конкретное объявление из нескольких. */}
                    {conversation.role === 'SPECIALIST' && (
                      <div className="chat-row__context">
                        {conversation.listing ? `по объявлению «${conversation.listing.title}»` : 'по вашей анкете'}
                      </div>
                    )}
                  </div>

                  {conversation.unread > 0 && <span className="chat-row__badge">{conversation.unread}</span>}
                </Link>
              ))}
            </div>
          )
        }
      </AsyncContent>
    </div>
  );
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
