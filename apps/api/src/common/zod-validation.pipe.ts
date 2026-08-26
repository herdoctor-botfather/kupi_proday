import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * Валидация тела/параметров запроса схемой zod из @app/shared.
 * Схема одна и та же на клиенте и на сервере, поэтому формы и API не расходятся.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: result.error.issues.map((i) => `${i.path.join('.') || 'значение'}: ${i.message}`).join('; '),
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
