import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Onboarding } from '@app/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { haptic } from '../lib/telegram';
import { markRoleChosen } from '../lib/session';

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
        role === 'MARKET'
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
      <div className="onboarding__intro">
        <div className="onboarding__emoji" aria-hidden>
          👋
        </div>
        <h1 className="onboarding__title">Добро пожаловать</h1>
        <p className="onboarding__subtitle">
          {user?.onboardedAs
            ? 'С чем пришли сегодня? Роль можно менять в любой момент — прошлый выбор ни к чему не обязывает.'
            : 'Каталог проверенных специалистов сферы услуг. Выберите, зачем вы здесь.'}
        </p>
      </div>

      {error && (
        <div style={{ color: 'var(--destructive)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
          {error}
        </div>
      )}

      <div className="role-cards">
        <button
          type="button"
          className={`role-card${user?.onboardedAs === 'CLIENT' ? ' role-card--previous' : ''}`}
          onClick={() => choose('CLIENT')}
          disabled={saving !== null}
        >
          {user?.onboardedAs === 'CLIENT' && <span className="role-card__mark">Прошлый выбор</span>}
          <span className="role-card__emoji" aria-hidden>
            🔍
          </span>
          <span className="role-card__title">Я ищу специалиста</span>
          <span className="role-card__text">
            Поиск по категориям и услугам, рейтинги и отзывы, карта мастеров рядом с вами
          </span>
          <span className="role-card__action">
            {saving === 'CLIENT' ? 'Открываем...' : 'Перейти в каталог →'}
          </span>
        </button>

        <button
          type="button"
          className={`role-card${user?.onboardedAs === 'SPECIALIST' ? ' role-card--previous' : ''}`}
          onClick={() => choose('SPECIALIST')}
          disabled={saving !== null}
        >
          {user?.onboardedAs === 'SPECIALIST' && <span className="role-card__mark">Прошлый выбор</span>}
          <span className="role-card__emoji" aria-hidden>
            🛠
          </span>
          <span className="role-card__title">Я оказываю услуги</span>
          <span className="role-card__text">
            {user?.hasSpecialistProfile
              ? 'Ваша анкета, её состояние, просмотры и отзывы'
              : 'Разместите анкету, чтобы вас находили клиенты. Заполнение занимает пару минут, публикация — после проверки модератором'}
          </span>
          <span className="role-card__action">
            {saving === 'SPECIALIST'
              ? 'Открываем...'
              : user?.hasSpecialistProfile
                ? 'Открыть мою анкету →'
                : 'Заполнить анкету →'}
          </span>
        </button>
      </div>

        <button
          type="button"
          className={`role-card${user?.onboardedAs === 'MARKET' ? ' role-card--previous' : ''}`}
          onClick={() => choose('MARKET')}
          disabled={saving !== null}
        >
          {user?.onboardedAs === 'MARKET' && <span className="role-card__mark">Прошлый выбор</span>}
          <span className="role-card__emoji" aria-hidden>
            🛍
          </span>
          <span className="role-card__title">Купи-продай</span>
          <span className="role-card__text">
            Объявления о продаже вещей: купить у людей рядом или продать своё
          </span>
          <span className="role-card__action">
            {saving === 'MARKET' ? 'Открываем...' : 'Открыть объявления →'}
          </span>
        </button>

      <p className="onboarding__note">
        Отдельная регистрация не нужна: вы уже вошли через Telegram. Пароли приложение не хранит.
        Каталог и карта доступны в обоих случаях — выбор влияет только на то, что открыть первым.
      </p>
    </div>
  );
}
