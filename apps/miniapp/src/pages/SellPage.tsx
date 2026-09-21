import { useMemo, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LISTING_CONDITIONS,
  LISTING_EXTRA_STARS,
  LISTING_PHOTOS_MAX,
  listingSchema,
  type ListingCondition,
  type ListingKind,
  type MyListing,
} from '@app/shared';
import { api, ApiRequestError } from '../lib/api';
import { withPayment } from '../lib/purchase';
import { CategoryWizard } from '../components/CategoryWizard';
import { PhotoDraftButton } from '../components/PhotoDraftButton';
import { WantedHint } from '../components/WantedHint';
import { AttributeFields } from '../components/AttributeFields';
import { useAsync } from '../lib/useAsync';
import { ChipsRow } from '../components/ChipsRow';
import { AsyncContent } from '../components/states';
import { CityInput } from '../components/CityInput';
import { ImageError, prepareImage } from '../lib/image';
import { DrawImage } from '../components/DrawImage';
import { WriteText } from '../components/WriteText';
import { haptic, tg } from '../lib/telegram';
import { useGoBack } from '../lib/navigation';
import { pluralize } from '../lib/format';

interface FormState {
  title: string;
  description: string;
  price: string;
  isNegotiable: boolean;
  isUrgent: boolean;
  exchangeFor: string;
  condition: ListingCondition;
  city: string;
  categoryIds: string[];
  /** Характеристики: память телефона, пробег машины, размер одежды. */
  attributes: Record<string, string | number | boolean | null>;
}

const EMPTY: FormState = {
  title: '',
  description: '',
  price: '',
  isNegotiable: false,
  isUrgent: false,
  exchangeFor: '',
  condition: 'USED',
  city: '',
  categoryIds: [],
  attributes: {},
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
    location.pathname.startsWith('/wanted')
      ? 'BUY'
      : location.pathname.startsWith('/career/new-job')
        ? 'JOB'
        : location.pathname.startsWith('/career/new-resume')
          ? 'RESUME'
          : 'SELL',
  );
  const wanted = kind === 'BUY';
  /*
   * Работа — тоже объявление, но с другими словами.
   *
   * «Что продаёте» у вакансии звучит дико, а «состояние» и «срочно» не
   * значат ничего. Поэтому форма одна, а подписи и лишние поля зависят
   * от того, с какой двери пришли.
   */
  const career = kind === 'JOB' || kind === 'RESUME';
  const vacancy = kind === 'JOB';

  const categories = useAsync(() => api.categories(career ? 'JOB' : 'PRODUCT'), [career]);
  const existing = useAsync(
    () => (editingId ? api.myListing(editingId) : Promise.resolve(null)),
    [editingId],
  );

  const [form, setForm] = useState<FormState>(EMPTY);
  /*
   * Характеристики берём у самой подробной из выбранных категорий.
   *
   * Их набор зависит от категории, а выбрать человек может несколько:
   * спрашиваем по последней выбранной — она и есть уточнение, ради
   * которого он лез в подкатегории.
   */
  const detailedCategory = form.categoryIds[form.categoryIds.length - 1];
  const categorySlug = useMemo(() => {
    for (const root of categories.data ?? []) {
      if (root.id === detailedCategory) return root.slug;
      const child = (root.children ?? []).find((item) => item.id === detailedCategory);
      if (child) return child.slug;
    }
    return null;
  }, [categories.data, detailedCategory]);

  const attributes = useAsync(
    () => (categorySlug ? api.categoryAttributes(categorySlug) : Promise.resolve([])),
    [categorySlug],
  );

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
        isUrgent: listing.isUrgent,
        exchangeFor: listing.exchangeFor ?? '',
        condition: listing.condition,
        city: listing.city,
        categoryIds: listing.categories.map((c) => c.id),
        // Сохранённые значения приходят строками для показа — этого
        // хватает: в форме те же варианты выбираются по названию.
        attributes: Object.fromEntries(listing.attributes.map((item) => [item.slug, item.value])),
      });
      setPhotos(listing.photos);
      setKind(listing.kind);
    }
    setLoaded(true);
  }, [existing.loading, existing.data, loaded]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /**
   * Создание с докупкой места.
   *
   * Три объявления в месяц бесплатны, четвёртое стоит 29 звёзд. Раньше
   * сервер отвечал на него «следующее — 29 ★», а купить это место было
   * негде: форма показывала ошибку, и человек упирался в тупик с уже
   * заполненным объявлением на руках.
   *
   * Теперь форма сама спрашивает, готов ли он заплатить, берёт звёзды
   * со счёта или открывает окно оплаты Telegram на недостающее и сразу
   * публикует — заполненное не пропадает.
   */
  const createWithSlot = async (dto: Parameters<typeof api.createListing>[0]) => {
    try {
      return await api.createListing(dto);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== 'LISTING_QUOTA_EXCEEDED') throw error;

      const agreed = await confirmDialog(
        `Бесплатные объявления этого месяца закончились. Разместить это за ${LISTING_EXTRA_STARS} ★?`,
      );
      if (!agreed) throw new Error('Объявление не отправлено: бесплатные закончились');

      await withPayment({ purpose: 'LISTING_SLOT' }, () => api.payFromBalance({ purpose: 'LISTING_SLOT' }));
      return api.createListing(dto);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);

    const parsed = listingSchema.safeParse({
      kind,
      title: form.title.trim(),
      description: form.description.trim() || null,
      price: form.price.trim() ? Number(form.price) : Number.NaN,
      isNegotiable: form.isNegotiable,
      isUrgent: form.isUrgent,
      exchangeFor: form.exchangeFor.trim() || null,
      condition: form.condition,
      city: form.city.trim(),
      categoryIds: form.categoryIds,
      attributes: form.attributes,
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
        : await createWithSlot(parsed.data);

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
          ? career
            ? vacancy
              ? 'Вакансия'
              : 'Резюме'
            : wanted
              ? 'Запрос'
              : 'Объявление'
          : vacancy
            ? 'Нужен сотрудник'
            : kind === 'RESUME'
              ? 'Ищу работу'
              : wanted
                ? 'Что вы ищете'
                : 'Новое объявление'}
      </h1>
      <p className="form-intro">
        {editingId
          ? 'После изменений объявление отправится на повторную проверку. С витрины оно не пропадёт.'
          : vacancy
            ? 'Опишите работу, оплату и график. Отклики придут прямо в переписку.'
            : kind === 'RESUME'
              ? 'Расскажите, что умеете и какую работу ищете. Размещение бесплатное.'
              : wanted
                ? 'Опишите, что нужно и сколько готовы заплатить. Продавцы увидят запрос и сами напишут вам.'
                : 'Заполните описание — модератор проверит объявление и опубликует его на витрине.'}
      </p>

      {saveError && <div className="alert alert--error">{saveError}</div>}

      <AsyncContent state={categories}>
        {(allCategories) => (
          <form onSubmit={submit} noValidate>
            {/*
              Путь для тех, кому некогда: снимок вместо семи полей.
              Стоит первым и только при создании — заполнять по фотографии
              уже готовое объявление значит стереть то, что человек
              правил руками.
            */}
            {!editingId && !career && (
              <PhotoDraftButton
                categories={allCategories}
                onDraft={(draft, files) => {
                  if (draft.title) set('title', draft.title);
                  if (draft.description) set('description', draft.description);
                  if (draft.price) set('price', String(draft.price));
                  if (draft.condition) set('condition', draft.condition);

                  // Категорию модель называет слагом — в форме нужен её
                  // идентификатор, и берём его из уже загруженного дерева.
                  if (draft.category) {
                    for (const root of allCategories) {
                      const match =
                        root.slug === draft.category
                          ? root
                          : (root.children ?? []).find((child) => child.slug === draft.category);
                      if (match) {
                        set('categoryIds', [match.id]);
                        break;
                      }
                    }
                  }

                  // Снимки сразу уходят в объявление: выбирать их
                  // второй раз человеку незачем. Сжимаем тем же путём,
                  // что и обычную загрузку, — иначе снимок с телефона
                  // на десяток мегабайт упёрся бы в предел сервера.
                  void (async () => {
                    for (const file of files) {
                      const blob = await prepareImage(file).catch(() => null);
                      if (!blob) continue;
                      setPendingPhotos((prev) =>
                        prev.length >= LISTING_PHOTOS_MAX
                          ? prev
                          : [
                              ...prev,
                              { id: `draft-${file.name}-${prev.length}`, blob, preview: URL.createObjectURL(blob) },
                            ],
                      );
                    }
                  })();
                }}
              />
            )}

            <Field
              label={
                vacancy ? 'Кто нужен' : kind === 'RESUME' ? 'Кем хотите работать' : wanted ? 'Что ищете' : 'Что продаёте'
              }
              error={errors.title}
              required
            >
              <input
                className="form-input"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder={
                  vacancy
                    ? 'Повар в кафе, сменный график'
                    : kind === 'RESUME'
                      ? 'Водитель категории B, стаж 5 лет'
                      : 'iPhone 13, 128 ГБ'
                }
              />
            </Field>

            {/* Встречный спрос: продавец видит, что вещь уже ждут, —
                и выкладывает не в пустоту, а конкретным людям. */}
            {kind === 'SELL' && <WantedHint title={form.title} city={form.city || undefined} />}

            <div className="form-row">
              <Field
                label={career ? 'Оплата от, ₽' : wanted ? 'Готов заплатить, ₽' : 'Цена, ₽'}
                error={errors.price}
                required
              >
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
                {career ? 'по договорённости' : 'торг'}
              </label>
            </div>

            {/*
              Срочная продажа — только у продавца: запрос «куплю» и так
              висит до тех пор, пока не найдётся вещь, и торопиться там
              некому.

              Отдельная витрина, а не пометка на общей: её листают охотнее,
              потому что там всегда есть повод поторопиться. Срок недельный
              и истекает сам — раздел, где «срочное» месячной давности,
              перестаёт что-либо значить.
            */}
            {!wanted && !career && (
              <label className="urgent-toggle">
                <input
                  type="checkbox"
                  checked={form.isUrgent}
                  onChange={(e) => set('isUrgent', e.target.checked)}
                />
                <span>
                  <span className="urgent-toggle__title">⚡️ Продать срочно</span>
                  <span className="urgent-toggle__text">
                    На неделю попадёт в отдельную витрину срочного. Условие одно:
                    цену нужно поставить ниже обычной. Туда приходят за скидкой —
                    без уступки срочное объявление быстрее не продаётся.
                  </span>
                </span>
              </label>
            )}

            {/*
              Обмен предлагает тот, кто ищет, — у продавца этого поля нет:
              что взять взамен, решает покупатель, а не он.

              Поле необязательное и стоит после цены, а не вместо неё:
              обмен здесь дополнение к деньгам, и большинство запросов
              останется денежными.
            */}
            {wanted && (
              <Field label="Готов обменять на" hint="Необязательно. Что предложите взамен">
                <input
                  className="form-input"
                  value={form.exchangeFor}
                  onChange={(e) => set('exchangeFor', e.target.value)}
                  placeholder="Обменяю на велосипед или доплачу"
                  maxLength={200}
                />
              </Field>
            )}

            {!career && (
            <Field label={wanted ? 'Какое состояние устроит' : 'Состояние'}>
              <ChipsRow>
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
              </ChipsRow>
            </Field>
            )}
            {/* Категория и характеристики — сразу под названием: пока
                человек не сказал, что это, спрашивать про цену и состояние
                рано, а половина полей просто не имеет смысла. */}
            <Field label="Категория" error={errors.categoryIds} required>
              <CategoryWizard
                categories={allCategories}
                attributes={attributes.data ?? []}
                categoryId={form.categoryIds[0] ?? null}
                values={form.attributes}
                onPickCategory={(id) => set('categoryIds', id ? [id] : [])}
                onChangeValues={(values) => set('attributes', values)}
              />
            </Field>

            {/* Остальные характеристики — обычными полями: цвет и пробег
                спрашивать отдельным экраном значило бы растянуть форму
                на десяток шагов ради мелочей. */}
            <AttributeFields
              attributes={(attributes.data ?? []).filter((attribute) => !attribute.isStep)}
              values={form.attributes}
              onChange={(values) => set('attributes', values)}
            />

            <Field label="Город" error={errors.city} required>
              <CityInput value={form.city} onChange={(city) => set('city', city)} invalid={Boolean(errors.city)} />
            </Field>

            <Field
              label="Описание"
              error={errors.description}
              hint={
                vacancy
                  ? 'Обязанности, место работы, когда выходить, что предлагаете'
                  : kind === 'RESUME'
                    ? 'Опыт, навыки, когда готовы приступить'
                    : wanted
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
              {/* Заготовку составляем по тому, что уже введено: заголовку,
                  городу и цене. Больше модель ничего не знает — и выдумывать
                  ей запрещено: отвечать за написанное всё равно продавцу. */}
              <div style={{ marginTop: 8 }}>
                <WriteText
                  disabled={saving}
                  draft={() =>
                    form.title.trim().length < 2
                      ? null
                      : {
                          purpose: wanted ? 'LISTING_BUY' : 'LISTING_SELL',
                          title: form.title.trim(),
                          city: form.city.trim() || undefined,
                          price: form.price.trim() ? `${form.price.trim()} руб.` : undefined,
                          categories: categories.data
                            ?.filter((c) => form.categoryIds.includes(c.id))
                            .map((c) => c.name),
                        }
                  }
                  onWritten={(text) => set('description', text)}
                />
              </div>
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

            {/*
              Рисованная картинка — только в запросе на покупку. Там она
              показывает, что человек ищет, и ничего не подменяет. В
              объявлении о продаже нарисованная вещь вместо настоящей —
              обман покупателя, который поедет через весь город к тому,
              чего не существует.
            */}
            {photoCount < LISTING_PHOTOS_MAX && (
              <div style={{ marginTop: 10 }}>
                <DrawImage
                  hint={
                    wanted
                      ? "Опишите вещь, которую ищете, — рисунок покажет продавцам, что именно вам нужно."
                      : "Рисунок не заменяет фотографию товара: покупатель приедет к настоящей вещи. Годится как обложка или пояснение."
                  }
                  onReady={async (image) => {
                    if (editingId) {
                      const updated = await api.addListingPhoto(editingId, image);
                      setPhotos(updated.photos);
                    } else {
                      setPendingPhotos((prev) => [
                        ...prev,
                        { id: `drawn-${prev.length}`, blob: image, preview: URL.createObjectURL(image) },
                      ]);
                    }
                  }}
                />
              </div>
            )}

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

/** Вопрос «да/нет» родным окном Telegram; вне Telegram — окном браузера. */
function confirmDialog(message: string): Promise<boolean> {
  const webApp = tg();
  if (!webApp) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => webApp.showConfirm(message, (ok) => resolve(ok)));
}
