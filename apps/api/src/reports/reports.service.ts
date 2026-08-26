import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateReportDto, ResolveReportDto } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Жалобы на карточки и отзывы.
 *
 * Жалоба ничего не меняет автоматически: она лишь ставит объект в очередь
 * к администратору. Автоматическое скрытие по числу жалоб выглядит удобным,
 * но превращается в оружие — конкуренты могут снести честную карточку
 * согласованными жалобами.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(reporterId: string, dto: CreateReportDto) {
    await this.assertTargetExists(dto.target, dto.targetId, reporterId);

    const existing = await this.prisma.report.findUnique({
      where: {
        reporterId_target_targetId: {
          reporterId,
          target: dto.target,
          targetId: dto.targetId,
        },
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_REPORTED',
        message: 'Вы уже пожаловались на это. Мы разбираемся.',
      });
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        target: dto.target,
        targetId: dto.targetId,
        reason: dto.reason,
        comment: dto.comment?.trim() || null,
      },
    });

    void this.notifications.notifyStaff(
      `🚩 <b>Новая жалоба</b>\n\n${dto.target === 'SPECIALIST' ? 'На карточку' : 'На отзыв'}: ${dto.reason}`,
    );

    return report;
  }

  /** Очередь для админки: сначала нерассмотренные, внутри — старые первыми. */
  async findOpen() {
    const reports = await this.prisma.report.findMany({
      where: { status: 'OPEN' },
      include: { reporter: { select: { firstName: true, lastName: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Подтягиваем объекты жалоб: связи в модели нет, потому что target
    // указывает на разные таблицы. Два запроса вместо N по одному на жалобу.
    const specialistIds = reports.filter((r) => r.target === 'SPECIALIST').map((r) => r.targetId);
    const reviewIds = reports.filter((r) => r.target === 'REVIEW').map((r) => r.targetId);

    const [specialists, reviews] = await Promise.all([
      this.prisma.specialist.findMany({
        where: { id: { in: specialistIds } },
        select: { id: true, displayName: true, slug: true, status: true, city: true },
      }),
      this.prisma.review.findMany({
        where: { id: { in: reviewIds } },
        select: {
          id: true,
          rating: true,
          text: true,
          status: true,
          specialist: { select: { id: true, displayName: true } },
        },
      }),
    ]);

    const specialistById = new Map(specialists.map((s) => [s.id, s]));
    const reviewById = new Map(reviews.map((r) => [r.id, r]));

    return reports.map((report) => ({
      ...report,
      specialist: report.target === 'SPECIALIST' ? (specialistById.get(report.targetId) ?? null) : null,
      review: report.target === 'REVIEW' ? (reviewById.get(report.targetId) ?? null) : null,
    }));
  }

  async resolve(reportId: string, dto: ResolveReportDto, actorId: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Жалоба не найдена' });

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.action === 'resolve' ? 'RESOLVED' : 'DISMISSED',
        resolutionNote: dto.note?.trim() || null,
        resolvedAt: new Date(),
        resolvedByUserId: actorId,
      },
    });
  }

  /** Счётчик для значка в меню админки. */
  countOpen(): Promise<number> {
    return this.prisma.report.count({ where: { status: 'OPEN' } });
  }

  private async assertTargetExists(
    target: CreateReportDto['target'],
    targetId: string,
    reporterId: string,
  ): Promise<void> {
    if (target === 'SPECIALIST') {
      const specialist = await this.prisma.specialist.findUnique({
        where: { id: targetId },
        select: { userId: true },
      });
      if (!specialist) {
        throw new NotFoundException({ code: 'TARGET_NOT_FOUND', message: 'Карточка не найдена' });
      }
      if (specialist.userId === reporterId) {
        throw new BadRequestException({ code: 'SELF_REPORT', message: 'Нельзя пожаловаться на себя' });
      }
      return;
    }

    const review = await this.prisma.review.findUnique({
      where: { id: targetId },
      select: { userId: true },
    });
    if (!review) {
      throw new NotFoundException({ code: 'TARGET_NOT_FOUND', message: 'Отзыв не найден' });
    }
    if (review.userId === reporterId) {
      throw new BadRequestException({
        code: 'SELF_REPORT',
        message: 'Это ваш отзыв — его можно удалить в личном кабинете',
      });
    }
  }
}
