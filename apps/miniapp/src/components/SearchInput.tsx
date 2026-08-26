export function SearchInput({
  value,
  onChange,
  placeholder = 'Поиск специалиста или услуги',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <span className="search__icon" aria-hidden>
        🔍
      </span>
      <input
        className="search__input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        // Telegram на iOS зумит поле при фокусе, если размер шрифта меньше 16px.
        style={{ fontSize: 16 }}
      />
    </div>
  );
}
