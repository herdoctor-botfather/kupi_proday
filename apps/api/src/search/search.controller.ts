import { Controller, Get, Query } from '@nestjs/common';
import type { ListingListItem, SpecialistListItem } from '@app/shared';
import { ListingsService } from '../listings/listings.service';
import { SpecialistsService } from '../specialists/specialists.service';

/** Сколько находок показываем в каждой группе: экран, а не выгрузка. */
const PER_GROUP = 6;

/** Что нашлось по запросу — по каждой двери отдельно. */
export type SearchResult = {
  specialists: SpecialistListItem[];
  sell: ListingListItem[];
  buy: ListingListItem[];
  jobs: ListingListItem[];
  resumes: ListingListItem[];
  total: number;
};

/**
 * Поиск по всей площадке.
 *
 * До него человек, не знавший, в какую дверь идти, был обязан выбрать
 * её заранее: «телевизор» искали отдельно на витрине, отдельно в
 * запросах, отдельно у мастеров по ремонту. Слово одно — дверей пять,
 * и четыре попытки из пяти заканчивались пустым экраном.
 *
 * Здесь запрос уходит во все двери сразу, а результаты возвращаются
 * группами: человек сам видит, что его «телевизор» есть и в продаже,
 * и в ремонте.
 */
@Controller('search')
export class SearchController {
  constructor(
    private readonly listings: ListingsService,
    private readonly specialists: SpecialistsService,
  ) {}

  @Get()
  async search(@Query('q') q?: string, @Query('city') city?: string): Promise<SearchResult> {
    const query = (q ?? '').trim().slice(0, 100);
    // Пустой запрос не ищем: выдача «всё подряд» ничего не отвечает,
    // а нагрузку создаёт.
    if (query.length < 2) {
      return { specialists: [], sell: [], buy: [], jobs: [], resumes: [], total: 0 };
    }

    const listingsOf = (kind: 'SELL' | 'BUY' | 'JOB' | 'RESUME') =>
      this.listings.findMany({
        kind,
        q: query,
        city,
        page: 1,
        pageSize: PER_GROUP,
        sort: 'new',
      });

    const [specialists, sell, buy, jobs, resumes] = await Promise.all([
      this.specialists.findMany({
        q: query,
        city,
        page: 1,
        pageSize: PER_GROUP,
        sort: 'rating',
        // Радиус в поиске не ограничивает: человек ищет словом, а не
        // расстоянием, и отсекать по нему здесь нечего.
        radiusKm: 20_000,
      }),
      listingsOf('SELL'),
      listingsOf('BUY'),
      listingsOf('JOB'),
      listingsOf('RESUME'),
    ]);

    return {
      specialists: specialists.items,
      sell: sell.items,
      buy: buy.items,
      jobs: jobs.items,
      resumes: resumes.items,
      total: specialists.total + sell.total + buy.total + jobs.total + resumes.total,
    };
  }
}
