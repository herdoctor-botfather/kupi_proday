import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ListingListItem } from '@app/shared';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/useAsync';
import { SearchInput } from '../components/SearchInput';
import { ListingCard } from '../components/ListingCard';
import { SpecialistCard } from '../components/SpecialistCard';
import { EmptyState } from '../components/states';
import { pluralize } from '../lib/format';

/**
 * Поиск по всей площадке.
 *
 * Раньше искать можно было только внутри двери: «телевизор» отдельно на
 * витрине, отдельно в запросах, отдельно у мастеров по ремонту. Слово
 * одно, дверей шесть, и человек, не угадавший с дверью, видел пустоту
 * там, где у площадки ответ был.
 *
 * Здесь запрос уходит сразу во все двери, а найденное разложено по ним
 * же: видно и телевизор в продаже, и мастера, который его починит.
 * Порядок групп — от предложения к спросу: чаще ищут, что купить.
 */
export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debounced = useDebounced(query);

  const result = useAsync(
    () =>
      debounced.trim().length >= 2
        ? api.search(debounced.trim())
        : Promise.resolve(null),
    [debounced],
  );

  // Запрос живёт в адресе: поиском делятся ссылкой, и возврат «назад»
  // не должен стирать набранное.
  const remember = (value: string) => {
    setQuery(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set('q', value.trim());
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const data = result.data;
  const nothing = data !== null && data !== undefined && data.total === 0;

  return (
    <div className="page">
      <h1 className="page__title">Поиск по площадке</h1>

      <SearchInput value={query} onChange={remember} placeholder="Что ищете?" />

      {data && data.total > 0 && (
        <div style={{ color: 'var(--text-hint)', fontSize: 13, margin: '4px 0 12px' }}>
          Найдено: {data.total} {pluralize(data.total, ['совпадение', 'совпадения', 'совпадений'])}
        </div>
      )}

      {data && data.specialists.length > 0 && (
        <>
          <Group title="Мастера" to={`/specialists?q=${encodeURIComponent(debounced.trim())}`} />
          <div className="card-list">
            {data.specialists.map((specialist) => (
              <SpecialistCard key={specialist.id} specialist={specialist} />
            ))}
          </div>
        </>
      )}

      {data && (
        <>
          <Listings
            title="Товары"
            items={data.sell}
            to={`/market/listings?q=${encodeURIComponent(debounced.trim())}`}
          />
          <Listings
            title="Запросы на покупку"
            items={data.buy}
            to={`/wanted/all?q=${encodeURIComponent(debounced.trim())}`}
          />
          <Listings
            title="Вакансии"
            items={data.jobs}
            to={`/career/jobs?q=${encodeURIComponent(debounced.trim())}`}
          />
          <Listings
            title="Резюме"
            items={data.resumes}
            to={`/career/resumes?q=${encodeURIComponent(debounced.trim())}`}
          />
        </>
      )}

      {nothing && (
        <EmptyState
          icon="🔎"
          title="Ничего не нашли"
          hint="Попробуйте назвать вещь иначе — или короче: «холодильник» вместо «холодильник Bosch белый»"
        />
      )}

      {!data && !result.loading && (
        <p className="form-hint">
          Ищем сразу везде: товары, запросы, мастера, вакансии и резюме. Введите пару букв.
        </p>
      )}
    </div>
  );
}

/** Заголовок группы со ссылкой на полную выдачу в своей двери. */
function Group({ title, to }: { title: string; to: string }) {
  return (
    <div className="search-group">
      <h2 className="section-title" style={{ margin: 0 }}>
        {title}
      </h2>
      <Link to={to} className="search-group__all">
        Все →
      </Link>
    </div>
  );
}

function Listings({ title, items, to }: { title: string; items: ListingListItem[]; to: string }) {
  if (items.length === 0) return null;

  return (
    <>
      <Group title={title} to={to} />
      <div className="listing-grid">
        {items.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </>
  );
}
