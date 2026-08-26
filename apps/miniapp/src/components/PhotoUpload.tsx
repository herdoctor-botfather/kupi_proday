import { useRef, useState } from 'react';
import type { MySpecialistProfile } from '@app/shared';
import { api } from '../lib/api';
import { ImageError, prepareImage } from '../lib/image';
import { haptic, tg } from '../lib/telegram';

/** Аватар анкеты: выбор файла, сжатие и загрузка одним действием. */
export function AvatarUpload({
  photoUrl,
  onUploaded,
}: {
  photoUrl: string | null;
  onUploaded: (profile: MySpecialistProfile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Показываем выбранный снимок сразу, не дожидаясь ответа сервера. */
  const [preview, setPreview] = useState<string | null>(null);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Сбрасываем значение, иначе повторный выбор того же файла не вызовет событие.
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    let localUrl: string | null = null;

    try {
      const blob = await prepareImage(file);
      localUrl = URL.createObjectURL(blob);
      setPreview(localUrl);

      const profile = await api.uploadAvatar(blob);
      haptic.success();
      onUploaded(profile);
    } catch (err) {
      haptic.error();
      setPreview(null);
      setError(err instanceof ImageError || err instanceof Error ? err.message : 'Не удалось загрузить');
    } finally {
      if (localUrl) URL.revokeObjectURL(localUrl);
      setBusy(false);
    }
  };

  const shown = preview ?? photoUrl;

  return (
    <div className="avatar-upload">
      <button
        type="button"
        className="avatar-upload__frame"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {shown ? (
          <img src={shown} alt="" className="avatar-upload__image" />
        ) : (
          <span className="avatar-upload__placeholder" aria-hidden>
            📷
          </span>
        )}
        {busy && <span className="avatar-upload__overlay">Загружаем...</span>}
      </button>

      <div className="avatar-upload__side">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {shown ? 'Заменить фото' : 'Загрузить фото'}
        </button>
        <div className="field__hint">
          Снимок уменьшается прямо в приложении, поэтому загрузка быстрая даже с мобильного интернета
        </div>
        {error && <div className="field__error">{error}</div>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={pick}
        hidden
      />
    </div>
  );
}

/** Галерея работ: добавление и удаление снимков. */
export function GalleryUpload({
  profile,
  onChanged,
}: {
  profile: MySpecialistProfile;
  onChanged: (profile: MySpecialistProfile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      // Грузим по очереди, а не разом: так понятнее, на каком снимке
      // случилась ошибка, и мобильная сеть не захлёбывается.
      let latest = profile;
      for (const file of files) {
        const blob = await prepareImage(file);
        latest = await api.addPhoto(blob);
        onChanged(latest);
      }
      haptic.success();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось загрузить');
    } finally {
      setBusy(false);
    }
  };

  const remove = (photoId: string) => {
    const run = async () => {
      setBusy(true);
      setError(null);
      try {
        await api.removePhoto(photoId);
        const updated = await api.myProfile();
        if (updated) onChanged(updated);
        haptic.success();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось удалить');
      } finally {
        setBusy(false);
      }
    };

    const app = tg();
    if (app) app.showConfirm('Удалить фотографию?', (ok) => ok && void run());
    else if (window.confirm('Удалить фотографию?')) void run();
  };

  return (
    <div>
      <div className="gallery-grid">
        {profile.photos.map((photo) => (
          <div key={photo.id} className="gallery-grid__item">
            <img src={photo.url} alt={photo.caption ?? ''} loading="lazy" />
            <button
              type="button"
              className="gallery-grid__remove"
              onClick={() => remove(photo.id)}
              disabled={busy}
              aria-label="Удалить фотографию"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          className="gallery-grid__add"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? '...' : '+'}
        </button>
      </div>

      <div className="field__hint">
        Покажите свои работы — с фотографиями обращаются заметно чаще. До 12 снимков.
      </div>
      {error && <div className="field__error">{error}</div>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={add}
        hidden
      />
    </div>
  );
}
