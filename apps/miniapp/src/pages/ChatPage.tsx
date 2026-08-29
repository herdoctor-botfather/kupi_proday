import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CONTACT_PLACEHOLDER, containsContacts, type ChatMessage } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, LoadingState } from '../components/states';
import { haptic } from '../lib/telegram';
import { formatPrice } from '../lib/format';

/** Как часто опрашиваем сервер, пока экран открыт. */
const POLL_INTERVAL_MS = 5000;

/**
 * Переписка с собеседником.
 *
 * Новые сообщения подтягиваются опросом раз в несколько секунд. Веб-сокеты
 * дали бы мгновенную доставку, но потребовали бы отдельного канала связи
 * и удержания соединения — для переписки, где ответ приходит за минуты,
 * это неоправданно. О сообщениях при закрытом приложении сообщает бот.
 */
export function ChatPage() {
  const { id = '' } = useParams();
  const [version, setVersion] = useState(0);
  const thread = useAsync(() => api.thread(id), [id, version]);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** Отправленные сообщения показываем сразу, не дожидаясь следующего опроса. */
  const [pending, setPending] = useState<ChatMessage[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Опрос работает, только пока экран открыт: фоновая нагрузка ни к чему.
  useEffect(() => {
    const timer = setInterval(() => setVersion((v) => v + 1), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const messages = useMemo(() => {
    const loaded = thread.data?.messages ?? [];
    const loadedIds = new Set(loaded.map((m) => m.id));
    // Как только сообщение пришло с сервера, локальную копию убираем,
    // иначе оно двоилось бы до следующей перезагрузки.
    return [...loaded, ...pending.filter((m) => !loadedIds.has(m.id))];
  }, [thread.data, pending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const willMaskContacts = containsContacts(draft);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setSendError(null);
    try {
      const message = await api.sendMessage(id, text);
      setPending((prev) => [...prev, message]);
      setDraft('');
      haptic.tap();
      if (message.hasMaskedContacts) haptic.error();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  };

  if (thread.loading && !thread.data) return <LoadingState text="Загружаем переписку..." />;
  if (thread.error && !thread.data) return <ErrorState message={thread.error} onRetry={thread.reload} />;
  if (!thread.data) return null;

  const { conversation } = thread.data;

  return (
    <div className="chat">
      <header className="chat__header">
        {conversation.peer.photoUrl ? (
          <img className="chat__avatar" src={conversation.peer.photoUrl} alt="" />
        ) : (
          <div className="chat__avatar" aria-hidden>
            {conversation.peer.name.charAt(0)}
          </div>
        )}
        <div className="chat__peer">
          <div className="chat__name">{conversation.peer.name}</div>
          {/* Ссылка на предмет разговора: анкета или объявление.
              Заказчику она нужна, чтобы свериться; владельцу — нет. */}
          {conversation.role === 'CLIENT' && conversation.specialist && (
            <Link to={`/specialist/${conversation.specialist.slug}`} className="chat__link">
              открыть анкету
            </Link>
          )}
          {conversation.listing && (
            <Link to={`/listing/${conversation.listing.slug}`} className="chat__link">
              {conversation.listing.title} · {formatPrice(conversation.listing.priceAmount, conversation.listing.currency)}
            </Link>
          )}
        </div>
      </header>

      <div className="chat__messages">
        {thread.data.hasMore && (
          <div className="chat__older">Показаны последние сообщения</div>
        )}

        {messages.length === 0 && (
          <div className="chat__empty">
            Напишите первое сообщение — расскажите, что нужно сделать и когда.
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`bubble${message.isMine ? ' bubble--mine' : ''}`}>
            <div className="bubble__text">{message.text}</div>
            <div className="bubble__time">
              {new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
                new Date(message.createdAt),
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {conversation.isBlocked ? (
        <div className="chat__blocked">Переписка закрыта администрацией</div>
      ) : (
        <form className="chat__composer" onSubmit={send}>
          {sendError && <div className="chat__error">{sendError}</div>}
          {willMaskContacts && (
            <div className="chat__warning">
              Телефоны и ссылки скрываются автоматически — договаривайтесь здесь, так безопаснее для обеих сторон
            </div>
          )}

          <div className="chat__input-row">
            <textarea
              className="chat__input"
              value={draft}
              maxLength={2000}
              rows={1}
              placeholder="Сообщение"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter отправляет, Shift+Enter переносит строку — привычно
                // по любому мессенджеру. На телефоне клавиша всегда переносит.
                if (event.key === 'Enter' && !event.shiftKey && !isTouchDevice()) {
                  event.preventDefault();
                  void send(event as unknown as React.FormEvent);
                }
              }}
            />
            <button type="submit" className="chat__send" disabled={sending || !draft.trim()}>
              {sending ? '…' : '↑'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const isTouchDevice = (): boolean => window.matchMedia('(pointer: coarse)').matches;

/** Метка, которой сервер заменяет контакты. Экспортируем для единообразия текстов. */
export { CONTACT_PLACEHOLDER };
