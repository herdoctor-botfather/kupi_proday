import { useState } from 'react';
import { api, type ConversationRow, type ListingRow } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from './states';
import { Modal } from './Modal';
import { formatDateTime } from '../lib/format';

/**
 * Переписка по объявлению — для разбора жалобы.
 *
 * Открывается не из общего списка, а из конкретного объявления: спор
 * всегда о чём-то, и это «что-то» и есть вход. Общего перечня всех
 * разговоров площадки в админке нет намеренно — он превращает
 * модерацию в наблюдение за людьми.
 *
 * Каждый просмотр записывается на сервере в журнал действий: кто
 * открыл, когда и сколько сообщений прочитал.
 */
export function ConversationDialog({ row, onClose }: { row: ListingRow; onClose: () => void }) {
  const list = useAsync(() => api.listingConversations(row.id), [row.id]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Modal title={`Переписки: ${row.title}`} onClose={onClose}>
      <p className="cell-muted" style={{ marginTop: 0 }}>
        Личная переписка. Открывайте только для разбора жалобы или спора — просмотр
        записывается в журнал действий.
      </p>

      {!openId && (
        <AsyncContent state={list}>
          {(rows: ConversationRow[]) =>
            rows.length === 0 ? (
              <EmptyState icon="💬" title="Переписок нет" hint="По этому объявлению никто не писал" />
            ) : (
              <div className="conv-list">
                {rows.map((item) => (
                  <button key={item.id} type="button" className="conv-row" onClick={() => setOpenId(item.id)}>
                    <span>
                      <b>{item.client.firstName}</b>
                      {item.client.username && <span className="cell-muted"> @{item.client.username}</span>}
                    </span>
                    <span className="cell-muted">
                      {item._count.messages} сообщ.
                      {item.lastMessageAt && ` · ${formatDateTime(item.lastMessageAt)}`}
                    </span>
                  </button>
                ))}
              </div>
            )
          }
        </AsyncContent>
      )}

      {openId && <Messages id={openId} onBack={() => setOpenId(null)} />}
    </Modal>
  );
}

/**
 * Сообщения одной переписки.
 *
 * Рядом с очищенным текстом показываем исходник, если в нём прятались
 * контакты: именно он и доказывает, что человека уводили с площадки —
 * ради таких случаев исходник и хранится.
 */
function Messages({ id, onBack }: { id: string; onBack: () => void }) {
  const state = useAsync(() => api.conversation(id), [id]);

  return (
    <>
      <button type="button" className="button button--secondary" onClick={onBack} style={{ marginBottom: 12 }}>
        ← К списку переписок
      </button>

      <AsyncContent state={state}>
        {(data) => (
          <div className="conv-messages">
            {data.messages.map((message) => (
              <div key={message.id} className="conv-message">
                <div className="conv-message__head">
                  <b>{message.sender.firstName}</b>
                  {message.sender.username && (
                    <span className="cell-muted"> @{message.sender.username}</span>
                  )}
                  <span className="cell-muted"> · {formatDateTime(message.createdAt)}</span>
                </div>
                <div className="conv-message__text">{message.text}</div>
                {message.hasMaskedContacts && message.originalText && (
                  <div className="conv-message__original">
                    <span className="badge badge--warning">до вычистки</span> {message.originalText}
                  </div>
                )}
              </div>
            ))}
            {data.messages.length === 0 && (
              <EmptyState icon="💬" title="Сообщений нет" hint="Переписка создана, но в ней пусто" />
            )}
          </div>
        )}
      </AsyncContent>
    </>
  );
}
