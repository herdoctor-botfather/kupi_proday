import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { upsertSpecialistSchema, type SpecialistStatus, type UpsertSpecialistDto } from '@app/shared';
import { api, type AdminSpecialistDetail } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, LoadingState } from '../components/states';
import { Modal } from '../components/Modal';
import { STATUS_LABELS, formatPrice, slugify } from '../lib/format';
import { SubscriptionsPanel } from '../components/SubscriptionsPanel';

const STATUSES: SpecialistStatus[] = ['DRAFT', 'PENDING', 'ACTIVE', 'HIDDEN', 'BLOCKED'];

type FormState = {
  displayName: string;
  slug: string;
  headline: string;
  about: string;
  photoUrl: string;
  city: string;
  address: string;
  lat: string;
  lng: string;
  phone: string;
  telegram: string;
  whatsapp: string;
  instagram: string;
  website: string;
  status: SpecialistStatus;
  isPromoted: boolean;
  categoryIds: string[];
};

const EMPTY_FORM: FormState = {
  displayName: '',
  slug: '',
  headline: '',
  about: '',
  photoUrl: '',
  city: '',
  address: '',
  lat: '',
  lng: '',
  phone: '',
  telegram: '',
  whatsapp: '',
  instagram: '',
  website: '',
  status: 'PENDING',
  isPromoted: false,
  categoryIds: [],
};

/** Создание и редактирование карточки специалиста. */
export function SpecialistEditPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const categories = useAsync(() => api.categories(), []);
  const existing = useAsync(
    () => (isNew ? Promise.resolve(null) : api.specialist(id!)),
    [id],
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Пока пользователь не правил slug вручную, он следует за именем. */
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setForm(toForm(existing.data));
    setSlugTouched(true);
  }, [existing.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const onNameChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      displayName: value,
      slug: slugTouched ? prev.slug : slugify(value),
    }));
    setSaved(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);

    const dto = toDto(form);
    const parsed = upsertSpecialistSchema.safeParse(dto);
    if (!parsed.success) {
      // Та же схема, что валидирует запрос на сервере, — расхождение исключено.
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const result = isNew
        ? await api.createSpecialist(parsed.data)
        : await api.updateSpecialist(id!, parsed.data);
      setSaved(true);
      if (isNew) navigate(`/specialists/${result.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.deleteSpecialist(id!);
      navigate('/specialists', { replace: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось удалить');
      setConfirmDelete(false);
    }
  };

  if (!isNew && existing.loading) return <LoadingState />;
  if (!isNew && existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isNew ? 'Новый специалист' : form.displayName || 'Карточка специалиста'}</h1>
          <p>
            {isNew
              ? 'Заполните карточку и выберите статус публикации'
              : `Просмотров: ${existing.data?.viewCount ?? 0} · отзывов: ${existing.data?.ratingCount ?? 0}`}
          </p>
        </div>
        <button type="button" className="button button--secondary" onClick={() => navigate('/specialists')}>
          ← К списку
        </button>
      </div>

      {saveError && <div className="alert alert--error">{saveError}</div>}
      {saved && <div className="alert alert--success">Сохранено.</div>}

      <form onSubmit={submit}>
        <div className="card">
          <div className="card__body">
            <div className="form-section__title" style={{ marginTop: 0 }}>
              Основное
            </div>
            <div className="form-grid">
              <Field label="Имя" error={errors.displayName} required>
                <input
                  className={`input${errors.displayName ? ' input--invalid' : ''}`}
                  value={form.displayName}
                  onChange={(event) => onNameChange(event.target.value)}
                />
              </Field>

              <Field
                label="Адрес в ссылке (slug)"
                error={errors.slug}
                hint="Латиница, цифры и дефис. Попадает в ссылку на профиль."
                required
              >
                <input
                  className={`input${errors.slug ? ' input--invalid' : ''}`}
                  value={form.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    set('slug', event.target.value);
                  }}
                />
              </Field>
            </div>

            <Field label="Краткое описание" hint="Строка под именем: «Мастер маникюра, 8 лет опыта»">
              <input className="input" value={form.headline} onChange={(e) => set('headline', e.target.value)} />
            </Field>

            <Field label="О специалисте">
              <textarea className="textarea" value={form.about} onChange={(e) => set('about', e.target.value)} />
            </Field>

            <Field label="Ссылка на фото" error={errors.photoUrl} hint="Полный URL изображения">
              <input
                className={`input${errors.photoUrl ? ' input--invalid' : ''}`}
                value={form.photoUrl}
                onChange={(e) => set('photoUrl', e.target.value)}
                placeholder="https://..."
              />
            </Field>

            <div className="form-section__title">Категории</div>
            {errors.categoryIds && <div className="field__error">{errors.categoryIds}</div>}
            {categories.data && (
              <div className="checkbox-grid">
                {categories.data.map((category) => (
                  <label key={category.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(category.id)}
                      onChange={(event) =>
                        set(
                          'categoryIds',
                          event.target.checked
                            ? [...form.categoryIds, category.id]
                            : form.categoryIds.filter((value) => value !== category.id),
                        )
                      }
                    />
                    <span>
                      {category.icon} {category.name}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="form-section__title">Расположение</div>
            <div className="form-grid">
              <Field label="Город" error={errors.city} required>
                <input
                  className={`input${errors.city ? ' input--invalid' : ''}`}
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                />
              </Field>
              <Field label="Адрес">
                <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="Широта" error={errors.lat} hint="Без координат карточки не будет на карте">
                <input
                  className={`input${errors.lat ? ' input--invalid' : ''}`}
                  value={form.lat}
                  onChange={(e) => set('lat', e.target.value)}
                  placeholder="55.7558"
                />
              </Field>
              <Field label="Долгота" error={errors.lng}>
                <input
                  className={`input${errors.lng ? ' input--invalid' : ''}`}
                  value={form.lng}
                  onChange={(e) => set('lng', e.target.value)}
                  placeholder="37.6173"
                />
              </Field>
            </div>

            <div className="form-section__title">Контакты</div>
            <p className="field__hint" style={{ marginTop: -8, marginBottom: 14 }}>
              Хотя бы один контакт обязателен по смыслу: без него клиент не сможет связаться.
            </p>
            <div className="form-grid">
              <Field label="Телефон">
                <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="Telegram" hint="@username или ссылка t.me">
                <input className="input" value={form.telegram} onChange={(e) => set('telegram', e.target.value)} />
              </Field>
              <Field label="WhatsApp" hint="Номер в международном формате">
                <input className="input" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
              </Field>
              <Field label="Instagram">
                <input className="input" value={form.instagram} onChange={(e) => set('instagram', e.target.value)} />
              </Field>
              <Field label="Сайт" error={errors.website}>
                <input
                  className={`input${errors.website ? ' input--invalid' : ''}`}
                  value={form.website}
                  onChange={(e) => set('website', e.target.value)}
                  placeholder="https://..."
                />
              </Field>
            </div>

            <div className="form-section__title">Публикация</div>
            <div className="form-grid">
              <Field label="Статус">
                <select
                  className="select"
                  value={form.status}
                  onChange={(e) => set('status', e.target.value as SpecialistStatus)}
                >
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.isPromoted}
                onChange={(e) => set('isPromoted', e.target.checked)}
              />
              <span>Продвигать — поднимать карточку выше в любой сортировке</span>
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="submit" className="button" disabled={saving}>
                {saving ? 'Сохраняем...' : isNew ? 'Создать' : 'Сохранить'}
              </button>
              {!isNew && (
                <button
                  type="button"
                  className="button button--secondary"
                  style={{ marginLeft: 'auto', color: 'var(--danger)' }}
                  onClick={() => setConfirmDelete(true)}
                >
                  Удалить карточку
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      {!isNew && existing.data && (
        <>
          <SubscriptionsPanel specialistId={existing.data.id} onChanged={() => existing.reload()} />

          {existing.data.services.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card__body">
                <h2 style={{ fontSize: 16, marginBottom: 4 }}>Услуги</h2>
                <p className="cell-muted" style={{ margin: '0 0 4px' }}>
                  Прайс-лист сейчас заполняется через сид или напрямую в базе. Редактирование услуг
                  из админки — следующий шаг.
                </p>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Услуга</th>
                      <th>Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existing.data.services.map((service) => (
                      <tr key={service.id}>
                        <td>{service.name}</td>
                        <td>
                          {service.priceIsFrom && 'от '}
                          {formatPrice(service.priceAmount, service.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {confirmDelete && (
        <Modal
          title="Удалить карточку?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button type="button" className="button button--secondary" onClick={() => setConfirmDelete(false)}>
                Отмена
              </button>
              <button type="button" className="button button--danger" onClick={remove}>
                Удалить
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            Вместе с карточкой «{form.displayName}» будут удалены её услуги, фотографии, отзывы и
            подписки. Отменить это нельзя.
          </p>
          <p className="cell-muted">
            Если нужно просто убрать специалиста из каталога — поставьте статус «Скрыт»: данные
            сохранятся, и карточку можно будет вернуть.
          </p>
        </Modal>
      )}
    </>
  );
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
    <div className="field">
      <span className="field__label">
        {label}
        {required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

function toForm(row: AdminSpecialistDetail): FormState {
  return {
    displayName: row.displayName,
    slug: row.slug,
    headline: row.headline ?? '',
    about: row.about ?? '',
    photoUrl: row.photoUrl ?? '',
    city: row.city,
    address: row.address ?? '',
    lat: row.lat === null ? '' : String(row.lat),
    lng: row.lng === null ? '' : String(row.lng),
    phone: row.phone ?? '',
    telegram: row.telegram ?? '',
    whatsapp: row.whatsapp ?? '',
    instagram: row.instagram ?? '',
    website: row.website ?? '',
    status: row.status,
    isPromoted: row.isPromoted,
    categoryIds: row.categories.map(({ category }) => category.id),
  };
}

/** Пустая строка в форме означает «не задано», а не пустое значение в базе. */
function toDto(form: FormState): UpsertSpecialistDto {
  const orNull = (value: string) => (value.trim() ? value.trim() : null);

  return {
    displayName: form.displayName.trim(),
    slug: form.slug.trim(),
    headline: orNull(form.headline),
    about: orNull(form.about),
    photoUrl: orNull(form.photoUrl),
    city: form.city.trim(),
    address: orNull(form.address),
    lat: form.lat.trim() ? Number(form.lat) : null,
    lng: form.lng.trim() ? Number(form.lng) : null,
    phone: orNull(form.phone),
    telegram: orNull(form.telegram),
    whatsapp: orNull(form.whatsapp),
    instagram: orNull(form.instagram),
    website: orNull(form.website),
    status: form.status,
    isPromoted: form.isPromoted,
    categoryIds: form.categoryIds,
  } as UpsertSpecialistDto;
}
