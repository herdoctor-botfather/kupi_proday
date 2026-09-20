import { PRIVACY, TERMS, type LegalDocument } from '../lib/legal';

/**
 * Правила и политика конфиденциальности.
 *
 * Обе открываются внутри приложения: документ, за которым нужно идти
 * в браузер, не читает никто, а ссылаться на непрочитанное нечестно.
 */
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const document: LegalDocument = kind === 'terms' ? TERMS : PRIVACY;

  return (
    <div className="page legal">
      <h1 className="page__title">{document.title}</h1>
      <p className="legal__updated">Действует с {document.updated}</p>
      <p className="legal__intro">{document.intro}</p>

      {document.sections.map((section) => (
        <section key={section.heading} className="legal__section">
          <h2 className="legal__heading">{section.heading}</h2>
          {section.paragraphs.map((text, index) => (
            <p key={index} className="legal__text">
              {text}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
