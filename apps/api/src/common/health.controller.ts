import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Проверка живости для балансировщика и мониторинга. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', uptimeSec: Math.round(process.uptime()) };
  }
}
