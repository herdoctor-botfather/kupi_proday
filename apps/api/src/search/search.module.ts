import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { ListingsModule } from '../listings/listings.module';
import { SpecialistsModule } from '../specialists/specialists.module';

/**
 * Поиск по всей площадке. Своих запросов к базе не делает — спрашивает
 * у разделов, каждый из которых уже знает, что и кому показывать:
 * скрытые анкеты, снятые объявления и чужие черновики сюда не попадут
 * просто потому, что их не отдают и по прямому запросу.
 */
@Module({
  imports: [ListingsModule, SpecialistsModule],
  controllers: [SearchController],
})
export class SearchModule {}
