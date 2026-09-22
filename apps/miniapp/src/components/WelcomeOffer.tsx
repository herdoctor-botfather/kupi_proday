import { Link } from 'react-router-dom';
import { LAUNCH_FREE_LABEL, isLaunchFree } from '@app/shared';
import { haptic } from '../lib/telegram';
import { leaveOnboarding } from '../lib/session';

/**
 * Чем встречаем новичка.
 *
 * Всё это у площадки давно есть: три бесплатных объявления в месяц,
 * пять звёзд в подарок за первое, десять процентов кешбэка и Telegram
 * Premium за приглашённых друзей. Но узнать об этом можно было только
 * из справки, куда заходят единицы, — то есть почти никак.
 *
 * Поэтому обещания стоят на самом видном месте и рядом с действием:
 * выложить и позвать друзей. Premium — самое сильное из них, поэтому
 * он не прячется до «когда-нибудь потом», а зовёт сразу.
 */
export function WelcomeOffer() {
  return (
    <div className="welcome">
      <div className="welcome__row">
        <span className="welcome__icon" aria-hidden>
          🎁
        </span>
        <span>
          {isLaunchFree() ? (
            <>
              <b>Сейчас всё бесплатно</b> — до {LAUNCH_FREE_LABEL}: объявления без ограничений,
              запросы и показ анкеты мастера. И ещё 5 ★ в подарок за первое объявление.
            </>
          ) : (
            <>
              <b>Первое объявление — бесплатно</b>, и ещё 5 ★ в подарок. Три бесплатных размещения
              каждый месяц, 10% звёздами возвращается с каждой покупки.
            </>
          )}
        </span>
      </div>

      <div className="welcome__row">
        <span className="welcome__icon" aria-hidden>
          💎
        </span>
        <span>
          <b>Telegram Premium в подарок</b> за друзей по вашей ссылке: месяц за 20 приглашённых,
          три месяца за 50, полгода за 80.
        </span>
      </div>

      <div className="welcome__actions">
        <Link
          to="/market/sell"
          className="button button--sm"
          onClick={() => {
            haptic.tap();
            // Блок стоит на стартовом экране: без этого переход вернул бы назад.
            leaveOnboarding();
          }}
        >
          Разместить бесплатно
        </Link>
        <Link
          to="/profile/referrals"
          className="button button--secondary button--sm"
          onClick={() => {
            haptic.tap();
            leaveOnboarding();
          }}
        >
          🎁 Позвать друзей
        </Link>
      </div>
    </div>
  );
}
