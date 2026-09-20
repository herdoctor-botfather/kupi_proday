import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { ListingCard } from '../components/ListingCard';
import { FeedHeader, FeedMore } from '../components/Feed';
import { EmptyState } from '../components/states';
import { haptic } from '../lib/telegram';
import { pluralize } from '../lib/format';
import { useIsAuthenticated } from '../lib/auth';

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
  const isAuthenticated = useIsAuthenticated();

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
        Сначала смотреть, потом размещать.

        Сперва кнопки звались «Ищу работу» и «Найти сотрудника» — и это
        читалось как размещение: человек, который ищет работу, ждал
        формы резюме, а попадал в список вакансий. Теперь название
        говорит, что откроется, а не с какой целью человек пришёл.
      */}
      <h2 className="section-title">Смотреть</h2>

      <Link to="/career/jobs" className="profile-cta" onClick={() => haptic.tap()}>
        <span className="profile-cta__icon" aria-hidden>
          🔎
        </span>
        <span className="profile-cta__body">
          <span className="profile-cta__title">Вакансии</span>
          <span className="profile-cta__text">
            {jobCount > 0
              ? `Кто нанимает прямо сейчас: ${jobCount}`
              : 'Кто нанимает в вашем городе'}
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
          <span className="profile-cta__title">Резюме</span>
          <span className="profile-cta__text">
            {resumeCount > 0
              ? `Людей в поиске работы: ${resumeCount}`
              : 'Кто ищет работу поблизости'}
          </span>
        </span>
        <span className="profile-cta__chevron" aria-hidden>
          ›
        </span>
      </Link>

      {isAuthenticated && (
        <>
          <h2 className="section-title">Разместить</h2>

          <Link to="/career/new-job" className="profile-cta" onClick={() => haptic.tap()}>
            <span className="profile-cta__icon" aria-hidden>
              💼
            </span>
            <span className="profile-cta__body">
              <span className="profile-cta__title">Разместить вакансию</span>
              <span className="profile-cta__text">Опишите работу и оплату — люди откликнутся сами</span>
            </span>
            <span className="profile-cta__chevron" aria-hidden>
              ›
            </span>
          </Link>

          <Link to="/career/new-resume" className="profile-cta" onClick={() => haptic.tap()}>
            <span className="profile-cta__icon" aria-hidden>
              📄
            </span>
            <span className="profile-cta__body">
              <span className="profile-cta__title">Разместить резюме</span>
              <span className="profile-cta__text">
                Бесплатно и без ограничений — расскажите, что умеете и кем хотите работать
              </span>
            </span>
            <span className="profile-cta__chevron" aria-hidden>
              ›
            </span>
          </Link>
        </>
      )}

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
