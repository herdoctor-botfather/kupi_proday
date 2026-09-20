import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/useAsync';
import { pluralize } from '../lib/format';

/**
 * «Вашу вещь уже ищут».
 *
 * Главный страх выкладывающего — что объявление повисит и никому не
 * понадобится. Между тем на обратной витрине лежат запросы: кто-то уже
 * написал, что ищет коляску, шуруповёрт, холодильник. Связь между ними
 * до сих пор нигде не показывалась — человек выкладывал в пустоту,
 * хотя покупатель был готов.
 *
 * Подсказка появляется по ходу набора названия: как только оно похоже
 * на что-то осмысленное, площадка отвечает — «это ищут двое».
 */
export function WantedHint({ title, city }: { title: string; city?: string }) {
  const query = useDebounced(title.trim());

  const found = useAsync(
    () =>
      query.length >= 3
        ? api.listings({ kind: 'BUY', q: query, city, pageSize: 3, sort: 'new' })
        : Promise.resolve(null),
    [query, city],
  );

  const total = found.data?.total ?? 0;
  if (total === 0) return null;

  return (
    <div className="wanted-hint">
      <span className="wanted-hint__icon" aria-hidden>
        🔥
      </span>
      <span className="wanted-hint__body">
        <span className="wanted-hint__title">
          Это уже ищут: {total} {pluralize(total, ['человек', 'человека', 'человек'])}
        </span>
        <span className="wanted-hint__text">
          {found.data?.items
            .slice(0, 2)
            .map((item) => item.title)
            .join(' · ')}
        </span>
        <Link className="wanted-hint__link" to={`/wanted/all?q=${encodeURIComponent(query)}`}>
          Посмотреть запросы →
        </Link>
      </span>
    </div>
  );
}
