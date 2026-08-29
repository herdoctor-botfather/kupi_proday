import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LISTING_CONDITIONS,
  LISTING_PHOTOS_MAX,
  listingSchema,
  type ListingCondition,
  type ListingKind,
  type MyListing,
} from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { CityInput } from '../components/CityInput';
import { ImageError, prepareImage } from '../lib/image';
import { haptic, tg } from '../lib/telegram';
import { useGoBack } from '../lib/navigation';
import { pluralize } from '../lib/format';

interface FormState {
  title: string;
  description: string;
  price: string;
  isNegotiable: boolean;
  condition: ListingCondition;
  city: string;
  categoryIds: string[];
}

const EMPTY: FormState = {
  title: '',
  description: '',
  price: '',
  isNegotiable: false,
  condition: 'USED',
  city: '',
  categoryIds: [],
};

/**
 * Снимок, выбранный до того, как объявление появилось на сервере.
 *
 * Сжатый файл ждёт в памяти, а `preview` — временная ссылка на него,
 * по которой картинка показывается в форме. Ссылку обязательно отзывать,
 * иначе браузер держит blob в памяти до перезагрузки страницы.
 */
interface PendingPhoto {
  id: string;
  blob: Blob;
  preview: string;
}

/**
 * Размещение и правка объявления.
 *
 * Фотографии привязываются к существующей записи: у нового объявления
 * ещё нет идентификатора, а значит и адреса, по которому их принять.
 * Поэтому выбранные снимки ждут в памяти, показываются в форме сразу,
 * и уходят на сервер сразу после того, как объявление создано. Для
 * человека это один шаг: заполнил, приложил фотографии, отправил.
 *
 * У существующего объявления ждать нечего — там снимок уходит сразу
 * по выбору, чтобы правка одной фотографии не требовала пересохранения.
 */
export function SellPage() {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const editingId = searchParams.get('id');
  /**
   * Форма обслуживает обе витрины. Что именно размещаем, приходит
   * параметром при создании, а при правке берётся из самого объявления:
   * переобуть запрос в продажу на полпути нельзя — это разные сделки.
   */
  // Форму открывают из двух разделов, и что именно размещаем, понятно
  // по адресу: /wanted/new — предложение в раздел спроса, /market/sell —
  // объявление на витрину. При правке вид берётся из самого объявления.
  const [kind, setKind] = useState<ListingKind>(
    location.pathname.startsWith('/wanted') ? 'BUY' : 'SELL',
  );
  const wanted = kind === 'BUY';

  const categories = useAsync(() => api.categories('PRODUCT'), []);
  const existing = useAsync(
    () => (editingId ? api.myListing(editingId) : Promise.resolve(null)),
    [editingId],
  );

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [photos, setPhotos] = useState<MyListing['photos']>([]);
  /** Снимки нового объявления — ждут в памяти до его создания. */
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Временные ссылки живут ровно столько, сколько экран: без этого браузер
  // держит в памяти каждый выбранный снимок до перезагрузки страницы.
  // Список читаем через ref: завязав уборку на сам список, мы отзывали бы
  // при добавлении второго снимка ссылку на первый — и он бы пропал.
  const pendingRef = useRef<PendingPhoto[]>([]);
  pendingRef.current = pendingPhotos;

  useEffect(
    () => () => {
      pendingRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
    },
    [],
  );

  const photoCount = photos.length + pendingPhotos.length;

  useEffect(() => {
    if (existing.loading || loaded) return;
    if (existing.data) {
      const listing = existing.data;
      setForm({
        title: listing.title,
        description: listing.description ?? '',
        // В базе копейки, в форме рубли.
        price: String(listing.priceAmount / 100),
        isNegotiable: listing.isNegotiable,
        condition: listing.condition,
        city: listing.city,
        categoryIds: listing.categories.map((c) => c.id),
      });
      setPhotos(listing.photos);
      setKind(listing.kind);
    }
    setLoaded(true);
  }, [existing.loading, existing.data, loaded]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);

    const parsed = listingSchema.safeParse({
      kind,
      title: form.title.trim(),
      description: form.description.trim() || null,
      price: form.price.trim() ? Number(form.price) : Number.NaN,
      isNegotiable: form.isNegotiable,
      condition: form.condition,
      city: form.city.trim(),
      categoryIds: form.categoryIds,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      haptic.error();
      document.querySelector('.field--invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const saved = editingId
        ? await api.updateListing(editingId, parsed.data)
        : await api.createListing(parsed.data);

      // Объявление создано — можно отдать снимки, которые ждали в памяти.
      // Если какой-то не уйдёт, объявление всё равно сохранено: остаёмся
      // на форме правки, где видно, что загрузилось, и можно повторить.
      // Условие не про создание, а про очередь: после неудачной попытки
      // экран уже работает в режиме правки, а неотправленные снимки ждут.
      if (pendingPhotos.length > 0) {
        const failed = await uploadPending(saved.id, pendingPhotos);

        const failedIds = new Set(failed.map((photo) => photo.id));
        pendingPhotos
          .filter((photo) => !failedIds.has(photo.id))
          .forEach((photo) => URL.revokeObjectURL(photo.preview));

        if (failed.length > 0) {
          setPendingPhotos(failed);
          setPhotos((await api.myListing(saved.id)).photos);
          setSaveError(
            failed.length === pendingPhotos.length
              ? 'Объявление сохранено, но фотографии загрузить не удалось. Попробуйте ещё раз.'
              : `Объявление сохранено. ${failed.length} ${pluralize(failed.length, ['фотографию', 'фотографии', 'фотографий'])} загрузить не удалось.`,
          );
          haptic.error();
          navigate(`/market/sell?id=${saved.id}`, { replace: true });
          return;
        }

        setPendingPhotos([]);
      }

      haptic.success();
      navigate('/market/my');
    } catch (err) {
      haptic.error();
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const addPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    // Лишние снимки отсекаем здесь: сервер отказал бы на одиннадцатом,
    // и человек узнал бы о пределе, уже выбрав два десятка фотографий.
    const room = LISTING_PHOTOS_MAX - photoCount;
    const accepted = files.slice(0, Math.max(0, room));

    setPhotoBusy(true);
    setPhotoError(files.length > accepted.length ? `Не больше ${LISTING_PHOTOS_MAX} фотографий` : null);

    try {
      for (const file of accepted) {
        const blob = await prepareImage(file);

        if (editingId) {
          // Объявление уже существует — снимок уходит сразу.
          const updated = await api.addListingPhoto(editingId, blob);
          setPhotos(updated.photos);
        } else {
          setPendingPhotos((prev) => [
            ...prev,
            { id: `${file.name}-${prev.length}`, blob, preview: URL.createObjectURL(blob) },
          ]);
        }
      }
      if (accepted.length > 0) haptic.success();
    } catch (err) {
      haptic.error();
      setPhotoError(err instanceof ImageError || err instanceof Error ? err.message : 'Не удалось загрузить');
    } finally {
      setPhotoBusy(false);
    }
  };

  /** Снимок, ещё не ушедший на сервер, убирается без подтверждения и без запроса. */
  const removePending = (id: string) => {
    setPendingPhotos((prev) => {
      const removed = prev.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((photo) => photo.id !== id);
    });
    haptic.tap();
  };

  const removePhoto = (photoId: string) => {
    const run = async () => {
      setPhotoBusy(true);
      try {
        await api.removeListingPhoto(photoId);
        if (editingId) setPhotos((await api.myListing(editingId)).photos);
      } catch (err) {
        setPhotoError(err instanceof Error ? err.message : 'Не удалось удалить');
      } finally {
        setPhotoBusy(false);
      }
    };

    const app = tg();
    if (app) app.showConfirm('Удалить фотографию?', (ok) => ok && void run());
    else if (window.confirm('Удалить фотографию?')) void run();
  };

  return (
    <div className="page">
      <h1 className="page__title">
        {editingId
          ? wanted
            ? 'Запрос'
            : 'Объявление'
          : wanted
            ? 'Что вы ищете'
            : 'Новое объявление'}
      </h1>
      <p className="form-intro">
        {editingId
          ? 'После изменений объявление отправится на повторную проверку. С витрины оно не пропадёт.'
          : wanted
            ? 'Опишите, что нужно и сколько готовы заплатить. Продавцы увидят запрос и сами напишут вам.'
            : 'Заполните описание — модератор проверит объявление и опубликует его на витрине.'}
      </p>

      {saveError && <div className="alert alert--error">{saveError}</div>}

      <AsyncContent state={categories}>
        {(allCategories) => (
          <form onSubmit={submit} noValidate>
            <Field label={wanted ? 'Что ищете' : 'Что продаёте'} error={errors.title} required>
              <input
                className="form-input"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="iPhone 13, 128 ГБ"
              />
            </Field>

            <div className="form-row">
              <Field label={wanted ? 'Готов заплатить, ₽' : 'Цена, ₽'} error={errors.price} required>
                <input
                  className="form-input"
                  value={form.price}
                  onChange={(e) => set('price', e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="45000"
                  inputMode="numeric"
                />
              </Field>
              <label className="checkbox-inline" style={{ paddingTop: 26 }}>
                <input
                  type="checkbox"
                  checked={form.isNegotiable}
                  onChange={(e) => set('isNegotiable', e.target.checked)}
                />
                торг
              </label>
            </div>

            <Field label={wanted ? 'Какое состояние устроит' : 'Состояние'}>
              <div className="chips">
                {LISTING_CONDITIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`chip${form.condition === option.value ? ' chip--active' : ''}`}
                    onClick={() => set('condition', option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Категория" error={errors.categoryIds} required hint="Не больше трёх">
              <div className="category-picker">
                {allCategories.map((category) => {
                  const active = form.categoryIds.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={`chip${active ? ' chip--active' : ''}`}
                      onClick={() => {
                        haptic.tap();
                        set(
                          'categoryIds',
                          active
                            ? form.categoryIds.filter((id) => id !== category.id)
                            : [...form.categoryIds, category.id],
                        );
                      }}
                    >
                      {category.icon} {category.name}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Город" error={errors.city} required>
              <CityInput value={form.city} onChange={(city) => set('city', city)} invalid={Boolean(errors.city)} />
            </Field>

            <Field
              label="Описание"
              error={errors.description}
              hint={
                wanted
                  ? 'Комплектация, допустимые изъяны, как быстро нужно'
                  : 'Состояние, комплектация, причина продажи'
              }
            >
              <textarea
                className="form-input form-textarea"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder={
                  wanted
                    ? 'Опишите, что именно нужно, чтобы вам не предлагали не то'
                    : 'Расскажите о товаре так, чтобы не пришлось переспрашивать'
                }
              />
            </Field>

            <h2 className="form-section">Фотографии</h2>

            <div className="gallery-grid">
              {photos.map((photo) => (
                <div key={photo.id} className="gallery-grid__item">
                  <img src={photo.url} alt="" loading="lazy" />
                  <button
                    type="button"
                    className="gallery-grid__remove"
                    onClick={() => removePhoto(photo.id)}
                    disabled={photoBusy || saving}
                    aria-label="Удалить фотографию"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Ещё не отправленные снимки выглядят так же: разделение
                  на «загруженные» и «ожидающие» человеку ничего не даёт. */}
              {pendingPhotos.map((photo) => (
                <div key={photo.id} className="gallery-grid__item">
                  <img src={photo.preview} alt="" />
                  <button
                    type="button"
                    className="gallery-grid__remove"
                    onClick={() => removePending(photo.id)}
                    disabled={saving}
                    aria-label="Убрать фотографию"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {photoCount < LISTING_PHOTOS_MAX && (
                <button
                  type="button"
                  className="gallery-grid__add"
                  onClick={() => inputRef.current?.click()}
                  disabled={photoBusy || saving}
                >
                  {photoBusy ? '...' : '+'}
                </button>
              )}
            </div>

            <div className="field__hint">
              {photoCount >= LISTING_PHOTOS_MAX
                ? `Больше ${LISTING_PHOTOS_MAX} фотографий не поместится`
                : wanted
                  ? 'Фотография нужна, только если важен конкретный вид вещи — подойдёт и снимок из интернета.'
                  : 'Первая фотография станет обложкой. Объявления без фото смотрят заметно реже.'}
            </div>
            {photoError && <div className="field__error">{photoError}</div>}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={addPhotos}
              hidden
            />

            <div className="form-actions">
              <button type="submit" className="button" disabled={saving || photoBusy}>
                {saving
                  ? pendingPhotos.length > 0
                    ? 'Загружаем фотографии...'
                    : 'Сохраняем...'
                  : editingId
                    ? 'Сохранить'
                    : 'Отправить на проверку'}
              </button>
              <button type="button" className="button button--secondary" onClick={goBack}>
                {editingId ? 'Готово' : 'Не сейчас'}
              </button>
            </div>
          </form>
        )}
      </AsyncContent>
    </div>
  );
}

/**
 * Отправляет накопленные снимки в созданное объявление.
 *
 * Последовательно, а не параллельно: сервер считает лимит по факту записи,
 * и десять одновременных запросов могли бы проскочить мимо проверки.
 * Возвращает те снимки, которые не ушли, — их показываем дальше, чтобы
 * человек мог повторить, а не выбирать фотографии заново.
 */
async function uploadPending(listingId: string, queue: PendingPhoto[]): Promise<PendingPhoto[]> {
  const failed: PendingPhoto[] = [];

  for (const photo of queue) {
    try {
      await api.addListingPhoto(listingId, photo.blob);
    } catch {
      failed.push(photo);
    }
  }

  return failed;
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <span className="field__label">
        {label}
        {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
      </span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}
