import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Onboarding } from '@app/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { haptic } from '../lib/telegram';
import { markRoleChosen } from '../lib/session';
/*
 * Обложки дверей импортируются, а не лежат в public.
 *
 * Статика отдаётся с заголовком «это никогда не изменится», и подмена
 * файла под тем же именем до людей не доходит: у одних новая картинка,
 * у других годами старая. Импорт добавляет в имя отпечаток содержимого,
 * и новая картинка получает новый адрес — обещание снова честное.
 */
import doorCatalog from '../assets/doors/catalog.jpg';
import doorApply from '../assets/doors/apply.jpg';
import doorMarket from '../assets/doors/market.jpg';
import doorWanted from '../assets/doors/wanted.jpg';
import doorUrgent from '../assets/doors/urgent.jpg';

/**
 * Стартовый экран: кто пришёл — заказчик или исполнитель.
 *
 * Выбор ни на что не влияет с точки зрения прав: любой может и искать
 * специалистов, и подать свою анкету. Он определяет только то, какой
 * экран показать первым, и его можно сменить в личном кабинете.
 */
export function OnboardingPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState<Onboarding | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (role: Onboarding) => {
    haptic.tap();
    setSaving(role);
    setError(null);
    try {
      const updated = await api.setOnboarding(role);
      setUser(updated);
      // Отмечаем до перехода, иначе редирект вернёт обратно на этот экран.
      markRoleChosen();
      // У кого анкета уже есть — сразу к ней, а не к пустой форме.
      const target =
        role === 'URGENT'
          ? '/market/urgent'
          : role === 'WANTED'
          ? '/wanted'
          : role === 'MARKET'
            ? '/market'
            : role === 'CLIENT'
              ? '/'
              : updated.hasSpecialistProfile
                ? '/profile/my-card'
                : '/profile/application';
      // Без replace: иначе история состоит из одной записи, и кнопка «Назад»
      // на форме анкеты видна, но возвращаться ей некуда.
      navigate(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить выбор');
      setSaving(null);
    }
  };

  return (
    <div className="page onboarding">
      {error && (
        <div style={{ color: 'var(--destructive)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
          {error}
        </div>
      )}

      <div className="role-cards">
        <button
          type="button"
          className={`role-card role-card--banner${user?.onboardedAs === 'CLIENT' ? ' role-card--previous' : ''}`}
          onClick={() => choose('CLIENT')}
          disabled={saving !== null}
        >
          {user?.onboardedAs === 'CLIENT' && <span className="role-card__mark">Прошлый выбор</span>}
          <span className="role-card__photo">
            <img src={doorCatalog} alt="Телефон в руке у сломанной стиральной машины" loading="lazy" />
          </span>
          <span className="role-card__title">Надо мастера</span>
          <span className="role-card__text">
            Найдём тех, кто работает рядом. С отзывами, ценами и метками на карте
          </span>
          <span className="role-card__action">
            {saving === 'CLIENT' ? 'Открываем...' : 'Перейти в каталог →'}
          </span>
        </button>

        <button
          type="button"
          className={`role-card role-card--banner${user?.onboardedAs === 'SPECIALIST' ? ' role-card--previous' : ''}`}
          onClick={() => choose('SPECIALIST')}
          disabled={saving !== null}
        >
          {user?.onboardedAs === 'SPECIALIST' && <span className="role-card__mark">Прошлый выбор</span>}
          <span className="role-card__photo">
            <img src={doorApply} alt="Мастер за работой в мастерской" loading="lazy" />
          </span>
          <span className="role-card__title">Я мастер</span>
          <span className="role-card__text">
            {user?.hasSpecialistProfile
              ? 'Ваша анкета, её состояние, просмотры и отзывы'
              : 'Разместите анкету — и вас начнут находить те, кому надо. Публикация после проверки'}
          </span>
          <span className="role-card__action">
            {saving === 'SPECIALIST'
              ? 'Открываем...'
              : user?.hasSpecialistProfile
                ? 'Открыть мою анкету →'
                : 'Заполнить анкету →'}
          </span>
        </button>

        <button
          type="button"
          className={`role-card role-card--banner${user?.onboardedAs === 'MARKET' ? ' role-card--previous' : ''}`}
          onClick={() => choose('MARKET')}
          disabled={saving !== null}
        >
          {user?.onboardedAs === 'MARKET' && <span className="role-card__mark">Прошлый выбор</span>}
          <span className="role-card__photo">
            <img src={doorMarket} alt="Фотоаппарат, одежда и гитара, готовые к продаже" loading="lazy" />
          </span>
          <span className="role-card__title">Надо купить или продать</span>
          <span className="role-card__text">
            Вещи от людей поблизости. Кому-то надо то, что вам уже нет
          </span>
          <span className="role-card__action">
            {saving === 'MARKET' ? 'Открываем...' : 'Открыть объявления →'}
          </span>
        </button>

        {/*
          Спрос отдельной дверью, а не разделом внутри барахолки.
          Это не «ещё один вид объявлений», а другая роль: человек приходит
          не покупать и не продавать, а посмотреть, что людям нужно прямо
          сейчас, — и предложить то, что у него уже есть.
        */}
        <button
          type="button"
          className={`role-card role-card--banner${user?.onboardedAs === 'WANTED' ? ' role-card--previous' : ''}`}
          onClick={() => choose('WANTED')}
          disabled={saving !== null}
        >
          {user?.onboardedAs === 'WANTED' && <span className="role-card__mark">Прошлый выбор</span>}
          <span className="role-card__photo">
            <img src={doorWanted} alt="Доска с записками: люди пишут, что ищут" loading="lazy" />
          </span>
          <span className="role-card__title">Запросы на покупку или обмен</span>
          <span className="role-card__text">
            Здесь люди ждут предложений — предложите, если у вас есть то, что им нужно.
            А не нашли нужное сами — оставьте свой запрос
          </span>
          <span className="role-card__action">
            {saving === 'WANTED' ? 'Открываем...' : 'Смотреть спрос →'}
          </span>
        </button>

        {/*
          Срочное отдельной дверью.
          Человек приходит сюда не выбирать, а успеть: здесь вещи, которые
          отдают дешевле ради скорости. На общей витрине такая вещь тонет
          среди тех, что висят месяцами, и повод поторопиться пропадает.
        */}
        <button
          type="button"
          className={`role-card role-card--banner role-card--wide${user?.onboardedAs === 'URGENT' ? ' role-card--previous' : ''}`}
          onClick={() => choose('URGENT')}
          disabled={saving !== null}
        >
          {user?.onboardedAs === 'URGENT' && <span className="role-card__mark">Прошлый выбор</span>}
          <span className="role-card__photo">
            <img src={doorUrgent} alt="Коробку заклеивают скотчем рядом с будильником" loading="lazy" />
          </span>
          <span className="role-card__title">⚡️ Надо срочно продать или купить</span>
          <span className="role-card__text">
            Вещи, которые отдают быстрее и дешевле. Кто торопится — тот уступает
          </span>
          <span className="role-card__action">
            {saving === 'URGENT' ? 'Открываем...' : 'Смотреть срочное →'}
          </span>
        </button>
      </div>

      <p className="onboarding__note">
        Отдельная регистрация не нужна — вы уже вошли через Telegram. Выбор влияет только на то,
        какой экран открыть первым, и меняется в любой момент.
      </p>
    </div>
  );
}
