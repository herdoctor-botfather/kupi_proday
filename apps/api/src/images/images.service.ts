import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IMAGE_GENERATION_STARS, IMAGE_PROMPT_MAX } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PaymentsService } from '../payments/payments.service';
import { createImageProvider, type ImageProvider } from './image-provider';

/** Сколько картинок один человек может нарисовать за сутки. */
const DAILY_LIMIT = 30;


/**
 * Рисование картинок по описанию.
 *
 * Сначала списываем, потом рисуем. Обратный порядок открывал бы простой
 * способ рисовать бесплатно: отправить десяток запросов разом, пока
 * баланс ещё не тронут. Если рисовалка откажет, звёзды возвращаются
 * сами — платить за несделанное человек не должен.
 */
@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);
  private readonly provider: ImageProvider = createImageProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly payments: PaymentsService,
  ) {}

  async draw(userId: string, rawPrompt: string) {
    const prompt = rawPrompt.trim();

    if (prompt.length < 3) {
      throw new BadRequestException({
        code: 'PROMPT_TOO_SHORT',
        message: 'Опишите, что нарисовать — хотя бы несколькими словами',
      });
    }
    if (prompt.length > IMAGE_PROMPT_MAX) {
      throw new BadRequestException({
        code: 'PROMPT_TOO_LONG',
        message: `Описание не длиннее ${IMAGE_PROMPT_MAX} символов`,
      });
    }

    /*
      * Предел на сутки — про очередь, а в бесплатный период ещё и про деньги.
      *
      * Каждая картинка стоит площадке живых рублей у поставщика модели.
      * Пока рисование бесплатно, предел ниже: иначе один человек за вечер
      * из любопытства нарисует сотню и опустошит счёт, с которого рисуют все.
      */
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = await this.prisma.generatedImage.count({
      where: { userId, createdAt: { gt: since } },
    });
    if (today >= DAILY_LIMIT) {
      throw new BadRequestException({
        code: 'DAILY_LIMIT',
        message: `За сутки можно нарисовать ${DAILY_LIMIT} картинок. Попробуйте завтра.`,
      });
    }

    // Рисование платное и в бесплатный период: каждая картинка стоит
    // площадке живых денег у поставщика модели, и бесплатное рисование
    // опустошило бы счёт, с которого рисуют все.
    await this.payments.payFromBalance(userId, { purpose: 'IMAGE_GENERATION' });

    try {
      const buffer = await this.provider.draw(prompt);
      const stored = await this.storage.putImage(buffer, 'drawn', userId);

      const image = await this.prisma.generatedImage.create({
        data: { userId, prompt, url: stored.url, key: stored.key },
        select: { id: true, url: true, prompt: true, createdAt: true },
      });

      return image;
    } catch (error) {
      // Возврат — часть отказа, а не отдельная процедура: человек
      // не должен узнавать о нём из переписки с поддержкой.
      await this.payments
        .refundToBalance(userId, IMAGE_GENERATION_STARS, 'Возврат: картинка не нарисовалась')
        .catch((failure: unknown) => {
          this.logger.error(`Не удалось вернуть звёзды ${userId}: ${String(failure)}`);
        });

      this.logger.warn(`Рисование не удалось (${this.provider.name}): ${String(error)}`);
      throw error;
    }
  }

  /** Последние картинки человека — чтобы поставить их куда-то потом. */
  async recent(userId: string) {
    return this.prisma.generatedImage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, url: true, prompt: true, createdAt: true },
    });
  }
}
