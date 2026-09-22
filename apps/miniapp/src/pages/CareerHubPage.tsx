import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { ListingCard } from '../components/ListingCard';
import { FeedHeader, FeedMore } from '../components/Feed';
import { EmptyState } from '../components/states';
import { haptic } from '../lib/telegram';
import { pluralize } from '../lib/format';

/** Сколько карточек показываем в ленте. */
const FEED_PAGE_SIZE = 6;

/**
 * Карьера: вакансии и резюме.
 *
 * Работа устроена как встречное движение: одни ищут людей, другие — где
 * заработать. Поэтому здесь не одна витрина с фильтром, а две двери,
 * и человек с порога говорит, с какой он стороны.
 *
 * Резюме размещаются бесплатно всегда. Брать деньги с того, кто ищет
 * заработок, значит зарабатывать на нужде, — а вакансия идёт в общий
 * счёт объявлений, как и всё остальное на площадке.
 */
export function CareerHubPage() {
  const jobs = useAsync(() => api.listings({ kind: 'JOB', pageSize: 1 }), []);
  const resumes = useAsync(() => api.listings({ kind: 'RESUME', pageSize: 1 }), []);

  const feed = usePagedFeed(
    (page) => api.listings({ kind: 'JOB', pageSize: FEED_PAGE_SIZE, sort: 'new', page }),
    [],
  );

  const jobCount = jobs.data?.total ?? 0;
  const resumeCount = resumes.data?.total ?? 0;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">Карьера</div>
        <h1 className="hero__title">Работа рядом</h1>
        <p className="hero__subtitle">
          {jobCount > 0
            ? `${jobCount} ${pluralize(jobCount, ['вакансия', 'вакансии', 'вакансий'])} и ${resumeCount} ${pluralize(resumeCount, ['резюме', 'резюме', 'резюме'])}`
            : 'Смена, подработка или постоянное место — по соседству, без посредников'}
        </p>
      </header>

      {/*
        Кнопки названы от лица человека: он приходит сюда с одной из двух
        мыслей — «мне нужна работа» или «мне нужны руки». Подпись под
        названием говорит, что откроется, чтобы ожидание совпало с тем,
        что человек увидит: ищущему работу показываем вакансии, ищущему
        сотрудника — резюме.
      */}
      <Link to="/career/jobs" className="profile-cta" onClick={() => haptic.tap()}>
        <span className="profile-cta__icon" aria-hidden>
          🔎
        </span>
        <span className="profile-cta__body">
          <span className="profile-cta__title">Ищу работу</span>
          <span className="profile-cta__text">
            {jobCount > 0
              ? `Открытые вакансии рядом: ${jobCount}`
              : 'Посмотреть, кто нанимает в вашем городе'}
          </span>
        </span>
        <span className="profile-cta__chevron" aria-hidden>
          ›
        </span>
      </Link>

      <Link to="/career/resumes" className="profile-cta" onClick={() => haptic.tap()}>
        <span className="profile-cta__icon" aria-hidden>
          🧑‍🔧
        </span>
        <span className="profile-cta__body">
          <span className="profile-cta__title">Ищу сотрудника</span>
          <span className="profile-cta__text">
            {resumeCount > 0
              ? `Людей в поиске работы: ${resumeCount}`
              : 'Посмотреть, кто ищет работу поблизости'}
          </span>
        </span>
        <span className="profile-cta__chevron" aria-hidden>
          ›
        </span>
      </Link>

      {/* Кнопок размещения здесь нет: они стоят внутри витрин, где
          человек уже увидел, что предлагают другие, и понимает, как
          выглядит хорошее объявление. А вот путь к своему — нужен:
          отправив резюме, человек возвращается сюда узнать, прошло ли оно
          проверку, и раньше не находил его нигде. */}
      <Link to="/career/my" className="career-mine" onClick={() => haptic.tap()}>
        📋 Мои вакансии и резюме — статус проверки
      </Link>

      {/* Лента вакансий сразу под кнопками: тому, кто зашёл посмотреть,
          нужна работа перед глазами, а не ещё один экран выбора. */}
      <FeedHeader title="Свежие вакансии" to="/career/jobs" total={feed.total} />

      {feed.items.length > 0 ? (
        <>
          <div className="listing-grid">
            {feed.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
          <FeedMore feed={feed} />
        </>
      ) : (
        !feed.loading && (
          <EmptyState
            icon="💼"
            title="Вакансий пока нет"
            hint="Разместите первую — она появится здесь после проверки"
          />
        )
      )}
    </div>
  );
}
