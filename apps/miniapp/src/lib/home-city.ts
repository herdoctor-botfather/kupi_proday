import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';

/**
 * Свой город — тот, что человек выбрал сам.
 *
 * Геолокацию спрашивают не все и не всегда: отказ от неё не означает,
 * что человеку всё равно, где искать. Без города такой человек листает
 * ленту всей страны, видит диван из Хабаровска и решает, что площадка
 * пустая, — хотя в его городе объявления есть.
 *
 * Хранится на устройстве, а не в профиле: город — свойство того, где
 * человек сейчас, а не его учётной записи. С телефона в командировке
 * он может выбрать другой, и это не должно менять его настройки везде.
 * Запись может не сработать в приватном режиме — тогда просто работаем
 * без памяти, а не падаем.
 */
const KEY = 'nado.city';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let current: string | null = read();
const listeners = new Set<() => void>();

export function setHomeCity(city: string | null): void {
  current = city;
  try {
    if (city) localStorage.setItem(KEY, city);
    else localStorage.removeItem(KEY);
  } catch {
    // Память недоступна — выбор проживёт до закрытия приложения.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHomeCity(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

/**
 * Подставляет свой город в фильтр ленты — один раз за открытие экрана.
 *
 * Именно один раз: иначе снять фильтр было бы невозможно. Человек
 * нажимает «Все города», город уходит из адреса — и подстановка тут же
 * вернула бы его обратно, превратив выбор в ловушку.
 */
export function useDefaultCity(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
  /** Выключается там, где место уже известно точнее — например, по координатам. */
  enabled = true,
): void {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;

    const city = current;
    if (!enabled || !city || searchParams.has('city')) return;

    const next = new URLSearchParams(searchParams);
    next.set('city', city);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, enabled]);
}
