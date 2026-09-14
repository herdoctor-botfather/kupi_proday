import { useState } from 'react';
import type { TextDraftDto } from '@app/shared';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';

/**
 * Черновик описания.
 *
 * Пустое поле «расскажите о товаре» — место, где объявления и умирают:
 * человек не знает, что писать, и оставляет пустым, а по объявлению без
 * слов никто не пишет. Кнопка даёт заготовку, которую он правит.
 *
 * Именно заготовку, а не готовый текст: модель знает только то, что уже
 * введено в форму, и отвечать за написанное всё равно продавцу. Поэтому
 * готовое подставляется в поле, где его видно и можно исправить, а не
 * уходит прямиком в объявление.
 */
export function WriteText({
  draft,
  onWritten,
  disabled,
}: {
  /** Что известно о вещи или мастере — ровно то, что человек уже ввёл. */
  draft: () => TextDraftDto | null;
  onWritten: (text: string) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const write = async () => {
    const dto = draft();
    if (!dto) {
      setError('Сначала напишите заголовок — по нему и составим текст');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      haptic.tap();
      const { text } = await api.draftText(dto);
      haptic.success();
      onWritten(text);
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось составить текст');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="button button--secondary button--sm"
        disabled={busy || disabled}
        onClick={() => void write()}
      >
        {busy ? 'Составляем...' : '✍️ Составить описание'}
      </button>
      {error && <div className="field__error">{error}</div>}
    </>
  );
}
