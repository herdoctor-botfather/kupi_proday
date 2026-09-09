import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LISTING_CONDITIONS } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { ReportButton } from '../components/ReportButton';
import { formatDate, formatPrice, pluralize } from '../lib/format';
import { categoryStyle } from '../lib/category-colors';
import { haptic } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';

/**
 * Карточка объявления — и товара, и запроса.
 *
 * Отличаются они только словами: у запроса цена это потолок покупателя,
 * автор не продавец, а покупатель, и написать ему идёт продавец с
 * предложением. Сущность одна, поэтому и экран один.
 */
export function ListingPage() {
  const { idOrSlug = '' } = useParams();
  const state = useAsync(() => api.listing(idOrSlug), [idOrSlug]);
  const isAuthenticated = useIsAuthenticated();
  const [photoIndex, setPhotoIndex] = useState(0);

  return (
    <div className="page">
      <AsyncContent state={state}>
        {(listing) => {
          const condition = LISTING_CONDITIONS.find((c) => c.value === listing.condition);

          return (
            <>
              {listing.photos.length > 0 ? (
                <div className="listing-photos">
                  <img className="listing-photos__main" src={listing.photos[photoIndex]?.url} alt="" />
                  {listing.photos.length > 1 && (
                    <div className="listing-photos__strip">
                      {listing.photos.map((photo, index) => (
                        <button
                          key={photo.id}
                          type="button"
                          className={`listing-photos__thumb${index === photoIndex ? ' listing-photos__thumb--active' : ''}`}
                          onClick={() => {
                            haptic.tap();
                            setPhotoIndex(index);
                          }}
                        >
                          <img src={photo.url} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="listing-photos__empty" aria-hidden>
                  {listing.kind === 'BUY' ? '🔎' : '📦'}
                </div>
              )}

              <div className="listing-price">
                {listing.kind === 'BUY' && (
                  <span className="listing-price__negotiable">готовы заплатить до</span>
                )}
                {formatPrice(listing.priceAmount, listing.currency)}
                {listing.isNegotiable && <span className="listing-price__negotiable">торг уместен</span>}
              </div>

              <h1 className="listing-title">{listing.title}</h1>

              <div className="listing-meta">
                {condition && <span className="badge-condition">{condition.label}</span>}
                {listing.categories.map((category) => (
                  <span key={category.id} className="tag" style={categoryStyle(category.slug)}>
                    {category.icon} {category.name}
                  </span>
                ))}
              </div>

              {/*
                Обмен стоит выше города и даты и отдельным блоком: это
                условие сделки, а не справка о запросе. Кто способен
                предложить вещь взамен, должен увидеть это до того,
                как решит писать.
              */}
              {listing.exchangeFor && (
                <div className="listing-exchange">
                  <span className="listing-exchange__label">Готов обменять на</span>
                  {listing.exchangeFor}
                </div>
              )}

              <div className="listing-meta listing-meta--muted">
                {listing.city} · {formatDate(listing.createdAt)} ·{' '}
                {listing.viewCount} {pluralize(listing.viewCount, ['просмотр', 'просмотра', 'просмотров'])}
              </div>

              <SellerAction listing={listing} isAuthenticated={isAuthenticated} />

              {listing.description && (
                <>
                  <h2 className="section-title">
                    {listing.kind === 'BUY' ? 'Что именно нужно' : 'Описание'}
                  </h2>
                  <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{listing.description}</p>
                </>
              )}

              <h2 className="section-title">{listing.kind === 'BUY' ? 'Покупатель' : 'Продавец'}</h2>
              {/*
                Продавец стал ссылкой: «а что он ещё продаёт» — вопрос,
                который покупатель задаёт себе перед тем, как написать,
                и ответ на него говорит о надёжности больше любых слов.

                У кого есть анкета — ведём сразу в неё: там отзывы, услуги
                и цены, то есть куда больше, чем список объявлений.
              */}
              <Link
                className="seller seller--link"
                to={
                  listing.seller.specialistSlug
                    ? `/specialist/${listing.seller.specialistSlug}`
                    : `/seller/${listing.seller.id}`
                }
                onClick={() => haptic.tap()}
              >
                {listing.seller.photoUrl ? (
                  <img className="seller__avatar" src={listing.seller.photoUrl} alt="" />
                ) : (
                  <div className="seller__avatar" aria-hidden>
                    {listing.seller.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="seller__name">{listing.seller.name}</div>
                  <div className="card__headline">
                    {listing.seller.specialistSlug ? 'Открыть анкету' : 'Другие объявления'}
                  </div>
                </div>
                <span className="profile-cta__chevron" aria-hidden>
                  ›
                </span>
              </Link>

              <div className="profile__footer">
                <ReportButton
                  target="SPECIALIST"
                  targetId={listing.id}
                  label={listing.kind === 'BUY' ? 'Пожаловаться на запрос' : 'Пожаловаться на объявление'}
                />
              </div>
            </>
          );
        }}
      </AsyncContent>
    </div>
  );
}

function SellerAction({
  listing,
  isAuthenticated,
}: {
  listing: { id: string; isMine: boolean; kind: 'SELL' | 'BUY' };
  isAuthenticated: boolean;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Своё объявление: писать себе незачем, ведём в управление им.
  if (listing.isMine) {
    return (
      <button
        type="button"
        className="button button--secondary"
        style={{ margin: '16px 0' }}
        onClick={() => navigate('/market/my')}
      >
        {listing.kind === 'BUY' ? 'Это ваш запрос — управлять' : 'Это ваше объявление — управлять'}
      </button>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="contact-note">
        Откройте приложение в Telegram, чтобы{' '}
        {listing.kind === 'BUY' ? 'предложить свой товар' : 'написать продавцу'}.
      </div>
    );
  }

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      haptic.tap();
      const conversation = await api.startListingConversation(listing.id);
      navigate(`/chat/${conversation.id}`);
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось открыть переписку');
      setBusy(false);
    }
  };

  return (
    <div style={{ margin: '16px 0' }}>
      <button type="button" className="button" onClick={write} disabled={busy}>
        {busy ? 'Открываем...' : listing.kind === 'BUY' ? '🤝 У меня есть — предложить' : '💬 Написать продавцу'}
      </button>
      {error && <div className="field__error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}
