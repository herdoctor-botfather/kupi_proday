import { useState } from 'react';
import { IMAGE_GENERATION_STARS, IMAGE_PROMPT_MAX } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { haptic } from '../lib/telegram';
import { withPayment } from '../lib/purchase';

/**
 * Нарисовать картинку по описанию.
 *
 * Нужна там, где фотографии нет и быть не может: обложка анкеты мастера,
 * иллюстрация к запросу «куплю велосипед». Вещи на продажу так не
 * оформляются — нарисованная плита вместо настоящей это обман покупателя,
 * поэтому кнопки там нет.
 *
 * Результат человек сначала видит, и только потом решает, ставить его
 * или рисовать заново. Сразу подставлять нельзя: с первого раза выходит
 * редко, а подставленное придётся откатывать.
 */
export function DrawImage({
  onReady,
  hint,
}: {
  /** Готовую картинку отдаём как файл: дальше она грузится обычным путём. */
  onReady: (image: Blob) => Promise<void> | void;
  hint: string;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<{ url: string } | null>(null);

  /* Баланс — чтобы кнопка не обещала одного, а делала другое:
     заработанные звёзды тратятся первыми, и человек должен это видеть. */
  const wallet = useAsync(() => api.wallet(), []);
  const balance = wallet.data?.balance ?? 0;
  const enough = balance >= IMAGE_GENERATION_STARS;

  const draw = async () => {
    setBusy(true);
    setError(null);
    try {
      haptic.tap();
      const image = await withPayment({ purpose: 'IMAGE_GENERATION' }, () =>
        api.drawImage(prompt.trim()),
      );
      haptic.success();
      setDrawn({ url: image.url });
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось нарисовать');
    } finally {
      setBusy(false);
    }
  };

  const use = async () => {
    if (!drawn) return;
    setBusy(true);
    setError(null);
    try {
      // Забираем из своего же хранилища и отдаём как обычный файл: так
      // картинка проходит той же дорогой, что и снятая на телефон,
      // и отдельной ветки для неё нигде не заводится.
      const response = await fetch(drawn.url);
      await onReady(await response.blob());
      haptic.success();
      close();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось поставить картинку');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOpen(false);
    setDrawn(null);
    setPrompt('');
    setError(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="button button--secondary"
        onClick={() => {
          haptic.tap();
          setOpen(true);
        }}
      >
        🎨 Нарисовать изображение
      </button>
    );
  }

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet__grip" aria-hidden />
        <h2 className="sheet__title">Нарисовать изображение</h2>

        {drawn ? (
          <>
            <img className="drawn__preview" src={drawn.url} alt="" />
            <div className="my-listing__actions">
              <button type="button" className="button" disabled={busy} onClick={() => void use()}>
                {busy ? 'Ставим...' : 'Поставить'}
              </button>
              <button
                type="button"
                className="button button--secondary"
                disabled={busy}
                onClick={() => {
                  setDrawn(null);
                }}
              >
                Ещё вариант
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="form-hint" style={{ marginTop: 0 }}>{hint}</p>
            {/*
              Совет о точности — перед полем, а не после неудачи.

              Рисовалка делает ровно то, что ей сказали, и не больше:
              «машина» даст случайную машину где угодно. Человек, не
              знающий этого, пишет два слова, получает не то и считает,
              что потратил звёзды впустую. Сказать заранее, что подробность
              и есть способ получить задуманное, — честнее, чем потом
              предлагать «ещё вариант» за те же деньги.
            */}
            <p className="draw-tip">
              ✍️ <b>Опишите как можно точнее</b> — что изображено, какого цвета, где стоит,
              какой фон и свет. Чем подробнее описание, тем ближе результат к тому, что вы
              задумали.
            </p>
            <textarea
              className="textarea"
              value={prompt}
              maxLength={IMAGE_PROMPT_MAX}
              placeholder="Например: белый кроссовер на берегу моря, закат, мокрый песок, вид сбоку"
              onChange={(event) => setPrompt(event.target.value)}
            />
            <button
              type="button"
              className="button"
              disabled={busy || prompt.trim().length < 3}
              onClick={() => void draw()}
            >
              {busy
                ? 'Рисуем, около минуты...'
                : enough
                  ? `Нарисовать за ${IMAGE_GENERATION_STARS} ★ с баланса`
                  : `Нарисовать — оплатить ${IMAGE_GENERATION_STARS} ★`}
            </button>
            <p className="form-hint">
              {enough
                ? `На балансе ${balance} ★ — спишем ${IMAGE_GENERATION_STARS} ★ оттуда.`
                : `На балансе ${balance} ★. Откроется окно оплаты звёздами Telegram.`}
            </p>
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        <button type="button" className="sheet__cancel" onClick={close}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
