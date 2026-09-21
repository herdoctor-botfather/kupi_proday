import { useRef, useState } from 'react';
import { PHOTO_DRAFT_MAX, type Category } from '@app/shared';
import { api, type PhotoDraft } from '../lib/api';
import { haptic } from '../lib/telegram';

/**
 * Объявление по фотографии.
 *
 * Самое дорогое в размещении — не деньги, а минуты. Форму из семи полей
 * человек с диваном в прихожей заполнять не станет, а снимок у него уже
 * есть: он его и так собирался приложить. Кнопка берёт этот снимок,
 * показывает его модели и заполняет заготовку — название, описание,
 * категорию, состояние и ориентир по цене.
 *
 * Заготовка, а не готовое объявление: всё заполненное человек видит
 * и правит. Отвечает за написанное он, значит и последнее слово за ним.
 *
 * Снимков можно выбрать несколько — одну вещь с разных сторон. С одного
 * ракурса модель не видит ни бирки с маркой, ни потёртости на спине,
 * а продавец и так снимает вещь со всех сторон для объявления.
 *
 * Снимки заодно уходят в объявление — выбирать их второй раз незачем.
 */
export function PhotoDraftButton({
  categories,
  onDraft,
}: {
  /** Дерево категорий: из него модель выбирает подходящую полку. */
  categories: Category[];
  onDraft: (draft: PhotoDraft, files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugs = categories.flatMap((root) => [
    root.slug,
    ...(root.children ?? []).map((child) => child.slug),
  ]);

  const handle = async (picked: File[]) => {
    const files = picked.slice(0, PHOTO_DRAFT_MAX);
    setBusy(true);
    setError(null);
    try {
      // Чем больше снимков, тем мельче каждый: запрос остаётся лёгким,
      // а деталей модели хватает и на 768 точках.
      const size = files.length > 1 ? 768 : 1024;
      const images = await Promise.all(files.map((file) => downscale(file, size)));
      const draft = await api.photoDraft(images, slugs);
      haptic.success();
      onDraft(draft, files);
      if (picked.length > files.length) {
        setError(`ИИ посмотрел первые ${PHOTO_DRAFT_MAX} фотографий — остальные можно добавить ниже`);
      }
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не получилось разобрать фотографию');
    } finally {
      setBusy(false);
      // Тот же файл можно выбрать снова: без сброса второй раз не сработает.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <button
        type="button"
        className="photo-draft"
        disabled={busy}
        onClick={() => {
          haptic.tap();
          inputRef.current?.click();
        }}
      >
        <span className="photo-draft__icon" aria-hidden>
          {busy ? '⏳' : '📸'}
        </span>
        <span className="photo-draft__body">
          <span className="photo-draft__title">
            {busy ? 'Смотрим фотографии…' : 'Создать объявление по фотографиям с NADO ИИ'}
          </span>
          <span className="photo-draft__text">
            {busy
              ? 'Через несколько секунд форма заполнится сама'
              : `Выберите до ${PHOTO_DRAFT_MAX} снимков вещи с разных сторон — название, описание и категорию подскажет ИИ. Бесплатно`}
          </span>
        </span>
        <span className="photo-draft__chevron" aria-hidden>
          ›
        </span>
      </button>

      {error && <div className="alert alert--error">{error}</div>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) void handle(files);
        }}
      />
    </>
  );
}

/**
 * Уменьшает снимок перед отправкой.
 *
 * Телефон снимает на десяток мегапикселей, а модели для «что это за
 * вещь» хватает тысячи точек по длинной стороне. Без сжатия человек
 * на мобильном интернете ждал бы загрузку дольше, чем сам ответ.
 */
async function downscale(file: File, max = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог обработать снимок');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', 0.82);
}
