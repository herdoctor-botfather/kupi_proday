import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LISTING_CONDITIONS } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { ReportButton } from '../components/ReportButton';
import { formatDate, formatPrice, pluralize } from '../lib/format';
import { categoryStyle } from '../lib/category-colors';
import { haptic } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';

/** Карточка товара: фотографии, цена, описание и кнопка «Написать продавцу». */
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
                  📦
                </div>
              )}

              <div className="listing-price">
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

              <div className="listing-meta listing-meta--muted">
                {listing.city} · {formatDate(listing.createdAt)} ·{' '}
                {listing.viewCount} {pluralize(listing.viewCount, ['просмотр', 'просмотра', 'просмотров'])}
              </div>

              <SellerAction listing={listing} isAuthenticated={isAuthenticated} />

              {listing.description && (
                <>
                  <h2 className="section-title">Описание</h2>
                  <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{listing.description}</p>
                </>
              )}

              <h2 className="section-title">Продавец</h2>
              <div className="seller">
                {listing.seller.photoUrl ? (
                  <img className="seller__avatar" src={listing.seller.photoUrl} alt="" />
                ) : (
                  <div className="seller__avatar" aria-hidden>
                    {listing.seller.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="seller__name">{listing.seller.name}</div>
                  <div className="card__headline">Общение через чат приложения</div>
                </div>
              </div>

              <div className="profile__footer">
                <ReportButton target="SPECIALIST" targetId={listing.id} label="Пожаловаться на объявление" />
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
  listing: { id: string; isMine: boolean };
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
        Это ваше объявление — управлять
      </button>
    );
  }

  if (!isAuthenticated) {
    return <div className="contact-note">Откройте приложение в Telegram, чтобы написать продавцу.</div>;
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
        {busy ? 'Открываем...' : '💬 Написать продавцу'}
      </button>
      {error && <div className="field__error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}
