import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  specialistApplicationSchema,
  type MySpecialistProfile,
  type SpecialistApplicationDto,
} from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { useGeolocation } from '../lib/geolocation';
import { haptic } from '../lib/telegram';
import { useAuth } from '../lib/auth';
import { AvatarUpload } from '../components/PhotoUpload';
import { useGoBack } from '../lib/navigation';
import { CityInput } from '../components/CityInput';

interface ServiceRow {
  name: string;
  price: string;
  priceIsFrom: boolean;
}

interface FormState {
  displayName: string;
  headline: string;
  about: string;
  photoUrl: string;
  city: string;
  address: string;
  lat: string;
  lng: string;
  categoryIds: string[];
  services: ServiceRow[];
}

const EMPTY: FormState = {
  displayName: '',
  headline: '',
  about: '',
  photoUrl: '',
  city: '',
  address: '',
  lat: '',
  lng: '',
  categoryIds: [],
  services: [],
};

/**
 * Анкета специалиста: подача и последующая правка.
 *
 * Форма проверяется той же схемой, что и запрос на сервере, поэтому
 * сообщения об ошибках совпадают и не расходятся при изменениях.
 */
export function ApplicationPage() {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { user, setUser } = useAuth();
  const categories = useAsync(() => api.categories(), []);
  const existing = useAsync(() => api.myProfile(), []);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const geo = useGeolocation();

  // Заполняем форму, если анкета уже подавалась.
  useEffect(() => {
    if (existing.loading || loaded) return;
    if (existing.data) setForm(toForm(existing.data));
    else if (user) setForm({ ...EMPTY, displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') });
    setLoaded(true);
  }, [existing.loading, existing.data, loaded, user]);

  // Кнопка «моё местоположение» подставляет координаты.
  useEffect(() => {
    if (!geo.coords) return;
    setForm((prev) => ({ ...prev, lat: String(geo.coords!.lat), lng: String(geo.coords!.lng) }));
    geo.clear();
  }, [geo.coords, geo.clear]);

  const isEditing = Boolean(existing.data);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);

    const parsed = specialistApplicationSchema.safeParse(toDto(form));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      haptic.error();
      // Показываем первую ошибку, а не заставляем искать её глазами.
      document.querySelector('.field--invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const saved = isEditing ? await api.updateProfile(parsed.data) : await api.createProfile(parsed.data);
      haptic.success();
      if (user) setUser({ ...user, onboardedAs: 'SPECIALIST', hasSpecialistProfile: true });
      navigate('/profile/my-card', { replace: true, state: { justSaved: saved.status } });
    } catch (err) {
      haptic.error();
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить анкету');
    } finally {
      setSaving(false);
    }
  };

  const addService = () => set('services', [...form.services, { name: '', price: '', priceIsFrom: false }]);
  const updateService = (index: number, patch: Partial<ServiceRow>) =>
    set('services', form.services.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeService = (index: number) =>
    set('services', form.services.filter((_, i) => i !== index));

  return (
    <div className="page">
      <h1 className="page__title">{isEditing ? 'Моя анкета' : 'Анкета специалиста'}</h1>
      <p className="form-intro">
        {isEditing
          ? 'После изменений анкета отправится на повторную проверку. Если она уже опубликована, из каталога не пропадёт.'
          : 'Заполните анкету — модератор проверит её и опубликует в каталоге. Обычно это занимает несколько часов.'}
      </p>

      {saveError && <div className="alert alert--error">{saveError}</div>}

      <AsyncContent state={categories}>
        {(allCategories) => (
          <form onSubmit={submit} noValidate>
            <h2 className="form-section">О себе</h2>

            <Field label="Имя" error={errors.displayName} required>
              <input
                className="form-input"
                value={form.displayName}
                onChange={(e) => set('displayName', e.target.value)}
                placeholder="Как вас представить клиентам"
              />
            </Field>

            <Field label="Чем занимаетесь" error={errors.headline} hint="Одна строка, её видно в списке">
              <input
                className="form-input"
                value={form.headline}
                onChange={(e) => set('headline', e.target.value)}
                placeholder="Мастер маникюра, 8 лет опыта"
              />
            </Field>

            <Field label="Подробнее" error={errors.about} hint="Опыт, подход, что входит в работу">
              <textarea
                className="form-input form-textarea"
                value={form.about}
                onChange={(e) => set('about', e.target.value)}
                placeholder="Расскажите о себе так, как рассказали бы клиенту при первой встрече"
              />
            </Field>

            {/* Аватар грузится отдельным запросом и сохраняется сразу,
                поэтому доступен только у существующей анкеты. */}
            {isEditing ? (
              <Field label="Фотография" error={errors.photoUrl}>
                <AvatarUpload
                  photoUrl={form.photoUrl || null}
                  onUploaded={(profile) => set('photoUrl', profile.photoUrl ?? '')}
                />
              </Field>
            ) : (
              <div className="field">
                <span className="field__label">Фотография</span>
                <span className="field__hint">
                  Загрузить фото и снимки работ можно будет сразу после отправки анкеты
                </span>
              </div>
            )}

            <h2 className="form-section">Категории</h2>
            <p className="field__hint" style={{ marginTop: -8, marginBottom: 10 }}>
              Выберите до пяти — по ним вас будут искать
            </p>
            {errors.categoryIds && <div className="field__error">{errors.categoryIds}</div>}
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

            <h2 className="form-section">Где принимаете</h2>

            <Field
              label="Город"
              error={errors.city}
              hint="Выбирайте из подсказки, если ваш город там есть — так вас найдут по фильтру"
              required
            >
              <CityInput value={form.city} onChange={(city) => set('city', city)} invalid={Boolean(errors.city)} />
            </Field>

            <Field label="Адрес" error={errors.address} hint="Не обязателен, если работаете с выездом">
              <input
                className="form-input"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="ул. Мясницкая, 24"
              />
            </Field>

            <Field
              label="Точка на карте"
              error={errors.lat}
              hint="Без координат анкета не появится на карте и в поиске «рядом»"
            >
              <button
                type="button"
                className="button button--secondary"
                onClick={() => geo.request()}
                disabled={geo.loading}
              >
                {geo.loading ? 'Определяем...' : form.lat ? '📍 Обновить местоположение' : '📍 Указать текущее место'}
              </button>
              {form.lat && form.lng && (
                <div className="field__hint" style={{ marginTop: 6 }}>
                  Координаты сохранены: {Number(form.lat).toFixed(4)}, {Number(form.lng).toFixed(4)}{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setForm((prev) => ({ ...prev, lat: '', lng: '' }))}
                  >
                    убрать
                  </button>
                </div>
              )}
              {geo.error && <div className="field__error">{geo.error}</div>}
            </Field>

            <div className="form-note">
              Телефон и мессенджеры в анкете не указываются: клиенты пишут вам через чат
              приложения. Так переписка сохраняется, и в спорной ситуации есть на что сослаться.
            </div>

            <h2 className="form-section">Услуги и цены</h2>
            <p className="field__hint" style={{ marginTop: -8, marginBottom: 10 }}>
              Не обязательно, но с ценами обращаются заметно чаще
            </p>
            {errors.services && <div className="field__error">{errors.services}</div>}

            {form.services.map((service, index) => (
              <div key={index} className="service-row">
                <input
                  className="form-input"
                  value={service.name}
                  onChange={(e) => updateService(index, { name: e.target.value })}
                  placeholder="Название услуги"
                />
                <div className="service-row__price">
                  <input
                    className="form-input"
                    value={service.price}
                    onChange={(e) => updateService(index, { price: e.target.value })}
                    placeholder="Цена, ₽"
                    inputMode="numeric"
                  />
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={service.priceIsFrom}
                      onChange={(e) => updateService(index, { priceIsFrom: e.target.checked })}
                    />
                    от
                  </label>
                  <button
                    type="button"
                    className="link-button link-button--danger"
                    onClick={() => removeService(index)}
                    aria-label="Удалить услугу"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            <button type="button" className="button button--secondary" onClick={addService}>
              + Добавить услугу
            </button>

            <div className="form-actions">
              <button type="submit" className="button" disabled={saving}>
                {saving ? 'Отправляем...' : isEditing ? 'Сохранить изменения' : 'Отправить на проверку'}
              </button>
              {/* Выход из формы нужен и при первом заполнении: человек мог
                  нажать «я специалист» по ошибке и хочет вернуться. */}
              <button type="button" className="button button--secondary" onClick={goBack}>
                {isEditing ? 'Отмена' : 'Не сейчас'}
              </button>
            </div>
          </form>
        )}
      </AsyncContent>
    </div>
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

function toForm(profile: MySpecialistProfile): FormState {
  return {
    displayName: profile.displayName,
    headline: profile.headline ?? '',
    about: profile.about ?? '',
    photoUrl: profile.photoUrl ?? '',
    city: profile.city,
    address: profile.address ?? '',
    lat: profile.lat === null ? '' : String(profile.lat),
    lng: profile.lng === null ? '' : String(profile.lng),
    categoryIds: profile.categories.map((c) => c.id),
    services: profile.services.map((service) => ({
      name: service.name,
      // В базе копейки, в форме рубли.
      price: service.priceAmount === null ? '' : String(service.priceAmount / 100),
      priceIsFrom: service.priceIsFrom,
    })),
  };
}

/** Пустая строка в форме означает «не указано», а не пустое значение. */
function toDto(form: FormState): unknown {
  const orNull = (value: string) => (value.trim() ? value.trim() : null);

  return {
    displayName: form.displayName.trim(),
    headline: orNull(form.headline),
    about: orNull(form.about),
    photoUrl: orNull(form.photoUrl),
    city: form.city.trim(),
    address: orNull(form.address),
    lat: form.lat.trim() ? Number(form.lat) : null,
    lng: form.lng.trim() ? Number(form.lng) : null,
    categoryIds: form.categoryIds,
    services: form.services
      // Пустые строки, добавленные и не заполненные, просто отбрасываем.
      .filter((service) => service.name.trim())
      .map((service) => ({
        name: service.name.trim(),
        price: service.price.trim() ? Number(service.price) : null,
        priceIsFrom: service.priceIsFrom,
      })),
  } satisfies Partial<SpecialistApplicationDto> as unknown;
}
