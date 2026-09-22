import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { GeoService } from './geo.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';

const pointSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/** Город по точке — для выбора города на карте. Только своим: геокодер чужой и бережём его. */
@Controller('geo')
@UseGuards(JwtAuthGuard)
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('city')
  city(@Query(new ZodValidationPipe(pointSchema)) point: z.infer<typeof pointSchema>) {
    return this.geo.city(point.lat, point.lng);
  }
}
