import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { pluralize } from '../lib/format';
import { haptic, tg } from '../lib/telegram';

/**
 * Приглашения.
 *
 * Счёт идёт не переходам по ссылке, а людям, которые на площадке что-то
 * сделали: выложили объявление или подали анкету. Приведённый зритель
 * ничего не стоит, а приведённый продавец — то, ради чего всё и затеяно.
 * Поэтому на экране два числа, а не одно: сколько пришло и сколько
 * в зачёте. Показывать только второе значило бы скрывать от человека,
 * что его ссылка работает.
 */
export function ReferralsPage() {
  const state = useAsync(() => api.referrals(), []);
  const [copied, setCopied] = useState(false);

  const share = (link: string) => {
    haptic.tap();
    const app = tg();
    const text = 'NADO — площадка, где находят мастеров и продают вещи. Заходи.';

    // Через Telegram делятся в два нажатия, и это главный путь. Копирование
    // остаётся запасным: в браузере или если человек хочет вставить ссылку
    // куда-то ещё.
    if (app) {
      app.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
      );
      return;
    }

    void navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="page">
      <h1 className="page__title">Приглашайте друзей</h1>

      <AsyncContent state={state}>
        {(data) => (
          <>
            <div className="referral-score">
              <div className="referral-score__item">
                <div className="referral-score__value">{data.qualified}</div>
                <div className="referral-score__label">
                  в зачёте
                </div>
              </div>
              <div className="referral-score__item">
                <div className="referral-score__value">{data.invited}</div>
                <div className="referral-score__label">перешли по ссылке</div>
              </div>
            </div>

            <p className="form-hint" style={{ marginTop: 0 }}>
              В зачёт идут те, кто выложил объявление или подал анкету. Просто переход
              по ссылке не считается — иначе приглашением было бы любое нажатие.
            </p>

            <button type="button" className="button" onClick={() => share(data.link)}>
              {copied ? 'Ссылка скопирована' : '🔗 Поделиться ссылкой'}
            </button>

            <div className="referral-link">{data.link}</div>

            <h2 className="section-title">Подарки</h2>

            <div className="card-list">
              {data.milestones.map((step) => (
                <div
                  key={step.invited}
                  className={`referral-step${step.reached ? ' referral-step--reached' : ''}`}
                >
                  <div className="referral-step__mark" aria-hidden>
                    {step.granted ? '✅' : step.reached ? '🎁' : step.invited}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="referral-step__title">{step.title}</div>
                    <div className="card__headline">
                      {step.granted
                        ? 'Подарок вручён'
                        : step.reached
                          ? 'Рубеж взят — мы свяжемся с вами'
                          : `За ${step.invited} ${pluralize(step.invited, ['приглашённого', 'приглашённых', 'приглашённых'])}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/*
              Состояние акции словами, а не только значками: «осталось семь»
              подталкивает, а «вы прошли всё» закрывает вопрос, который иначе
              человек будет задавать поддержке.
            */}
            <p className="form-hint">
              {data.toNext === null
                ? 'Вы прошли все рубежи акции. Спасибо — без вас площадки бы не было.'
                : `До следующего подарка осталось ${data.toNext} ${pluralize(data.toNext, ['человек', 'человека', 'человек'])}.`}
            </p>
          </>
        )}
      </AsyncContent>
    </div>
  );
}
