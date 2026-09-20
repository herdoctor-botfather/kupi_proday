import credits from '../assets/car-credits.json';

/**
 * Откуда взяты снимки кузовов.
 *
 * Фотографии машин взяты из Викисклада под свободными лицензиями.
 * Часть из них — CC BY и CC BY-SA: они разрешают показывать снимок
 * кому угодно и где угодно, но требуют назвать автора. Это условие,
 * а не любезность, поэтому список авторов живёт отдельной страницей,
 * а не теряется в примечании мелким шрифтом.
 *
 * Снимки, нарисованные для площадки, в списке не значатся: у них нет
 * автора вне этой площадки.
 */
type Credit = { title: string; author: string; license: string; page: string };

export function CreditsPage() {
  const items = Object.entries(credits as Record<string, Credit>)
    .map(([file, credit]) => ({ file, ...credit }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));

  return (
    <div className="page">
      <h1 className="page__title">Источники фотографий</h1>
      <p className="form-hint" style={{ marginTop: 0 }}>
        Снимки кузовов автомобилей взяты из Викисклада под свободными лицензиями. Ниже — авторы
        и условия, на которых эти снимки используются.
      </p>

      <div className="credits">
        {items.map((item) => (
          <a
            key={item.file}
            className="credits__row"
            href={item.page}
            target="_blank"
            rel="noreferrer noopener"
          >
            <span className="credits__title">{item.title.replace(/^File:/, '')}</span>
            <span className="credits__meta">
              {item.author || 'автор не указан'} · {item.license}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
