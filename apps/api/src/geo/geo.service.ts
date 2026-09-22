import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * Какой город стоит в точке на карте.
 *
 * Спрашиваем открытый геокодер OpenStreetMap, а не Яндекс: наш ключ
 * Яндекс Карт выпущен только для показа карты и на геокодер отвечает
 * отказом. Правила OpenStreetMap просят не чаще запроса в секунду и
 * честную подпись — поэтому запросы идут по одному, а ответы помним:
 * люди из одного города тыкают в одни и те же места.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  /** Ключ — точка, округлённая до ~1 км: соседние нажатия дают тот же город. */
  private readonly cache = new Map<string, string | null>();
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;

  async city(lat: number, lng: number): Promise<{ city: string | null }> {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (this.cache.has(key)) return { city: this.cache.get(key) ?? null };

    // По одному и не чаще раза в секунду — как просит OpenStreetMap.
    const run = this.queue.then(async () => {
      const wait = 1100 - (Date.now() - this.last);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.last = Date.now();
      return this.lookup(lat, lng);
    });
    this.queue = run.catch(() => undefined);

    const city = await run;
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(key, city);
    return { city };
  }

  private async lookup(lat: number, lng: number): Promise<string | null> {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=ru' +
      `&lat=${lat}&lon=${lng}`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'NADO-marketplace/1.0 (Telegram @NADO_SUP)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        address?: { city?: string; town?: string; village?: string; hamlet?: string; state?: string };
      };
      const address = data.address ?? {};
      // Город, иначе посёлок или село — то, что человек назовёт своим городом.
      return address.city ?? address.town ?? address.village ?? address.hamlet ?? null;
    } catch (error) {
      this.logger.warn(`Геокодер не ответил: ${String(error)}`);
      throw new ServiceUnavailableException('Не удалось определить город. Выберите его из списка');
    }
  }
}
