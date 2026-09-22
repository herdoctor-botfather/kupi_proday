import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { AsyncContent, EmptyState } from '../components/states';
import { SearchInput } from '../components/SearchInput';
import { SpecialistCard } from '../components/SpecialistCard';
import { FeedHeader, FeedMore } from '../components/Feed';
import { haptic } from '../lib/telegram';
import { pluralize } from '../lib/format';
import { categoryStyle } from '../lib/category-colors';

/*
 * Обложки категорий — через сборку, а не из public/: сервер отдаёт
 * картинки с кэшем на год, и новая обложка под старым именем у части
 * людей так и не появлялась. Сборка даёт каждой версии своё имя.
 */
const COVERS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../assets/categories/*.jpg', { eager: true, import: 'default' }),
  ).map(([path, url]) => [path.replace(/^.*\/|\.jpg$/g, ''), url]),
);

/** Категорию завели в админке, а обложку ещё не нарисовали — берём общую. */
const coverOf = (slug: string): string => COVERS[slug] ?? COVERS['other-services'];

/** Сколько карточек показывает лента за раз. */
const FEED_PAGE_SIZE = 4;

/**
 * Главный экран.
 *
 * Поиск, категории и лента мастеров. Двери в другие разделы отсюда убраны:
 * этот экран про услуги, а переходы в барахолку и запросы живут в нижней
 * навигации. Лента отвечает на вопрос «что здесь вообще есть» тем, кто
 * пришёл без запроса: пустой поиск и сетка категорий этого не показывают,
 * а живые карточки показывают сразу.
 *
 * Товары в ленту не попадают: сюда приходят по кнопке «я ищу специалиста»,
 * и объявления о продаже дивана здесь не к месту. Их лента живёт
 * в «Купи-продай» — там она и ожидается.
 */
export function CatalogPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const categories = useAsync(() => api.categories(), []);

  const services = usePagedFeed(
    (page) => api.specialists({ pageSize: FEED_PAGE_SIZE, page }),
    [],
  );


  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) navigate(`/specialists?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="page">
      <form onSubmit={submitSearch}>
        <SearchInput value={query} onChange={setQuery} />
      </form>

      {/* Срочный вызов стоит выше поиска по каталогу: когда прорвало трубу,
          листать карточки некогда, и путь к помощи должен быть коротким.
          Само название площадки — про это. */}
      <button
        type="button"
        className="button urgent-call"
        onClick={() => {
          haptic.tap();
          navigate('/urgent');
        }}
      >
        ⚡️ Надо срочно — позвать мастера сейчас
      </button>

      <button
        type="button"
        className="button button--secondary"
        onClick={() => {
          haptic.tap();
          // «Рядом» — это про место, и отвечать на него картой честнее
          // списка: видно, где ты и кто вокруг. Местоположение карта
          // запросит сама, а список по расстоянию остаётся кнопкой на ней.
          navigate('/map?near=1');
        }}
      >
        📍 Найти рядом
      </button>

      <h2 className="section-title">Категории</h2>

      <AsyncContent state={categories}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="📭" title="Категории ещё не заведены" hint="Добавьте их в админ-панели" />
          ) : (
            <div className="categories">
              {items.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="category category--photo"
                  style={{
                    ...categoryStyle(category.slug),
                    // Снимок задаётся фоном, а не тегом img: плитке нужен
                    // именно фон, поверх которого лежит затемнение и текст.
                    backgroundImage: `url(${coverOf(category.slug)})`,
                  }}
                  onClick={() => {
                    haptic.tap();
                    navigate(`/services/c/${category.slug}`);
                  }}
                >
                  <span className="category__name">{category.name}</span>
                  <span className="category__count">
                    {category.itemCount > 0
                      ? `${category.itemCount} ${pluralize(category.itemCount, ['мастер', 'мастера', 'мастеров'])}`
                      : 'Пока пусто'}
                  </span>
                </button>
              ))}
            </div>
          )
        }
      </AsyncContent>

      <FeedHeader title="Мастера" to="/specialists" total={services.total} />
      {services.items.length > 0 ? (
        <>
          <div className="card-list">
            {services.items.map((specialist) => (
              <SpecialistCard key={specialist.id} specialist={specialist} />
            ))}
          </div>
          <FeedMore feed={services} />
        </>
      ) : (
        !services.loading && (
          <EmptyState
            icon="🛠"
            title="Станьте первым мастером здесь"
            hint="Все, кто зайдёт в этот раздел, увидят только вас. Первая неделя показа анкеты — в подарок."
            action={{ label: 'Разместить анкету бесплатно', to: '/profile/application' }}
          />
        )
      )}
    </div>
  );
}
