import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Request, Response } from 'express';
import { NotificationEventsService } from '../notification/notification-events.service.js';
import { buildSystemErrorNotification } from '../notification/notification-event.factory.js';

@Injectable()
@Catch(QueryFailedError)
export class DatabaseErrorFilter implements ExceptionFilter {
  constructor(private readonly notifications?: NotificationEventsService) {}

  catch(exception: QueryFailedError, host: ArgumentsHost): number {
    const code = (exception.driverError as { code?: string }).code;
    const errors: Record<string, [number, string]> = {
      '23505': [409, 'Já existe um registro com esses dados'],
      '23503': [409, 'Registro vinculado a outros dados ou referência inexistente'],
      '22P02': [400, 'Identificador ou valor inválido'],
      '42703': [500, 'Coluna inexistente no banco de dados — execute as migrações pendentes'],
    };
    const [statusCode, message] = errors[code ?? ''] ?? [500, 'Não foi possível concluir a operação no banco'];

    if (statusCode >= 500 && this.notifications) {
      const request = host
        .switchToHttp()
        .getRequest<Request & { user?: { companyId?: string | null } }>();
      this.notifications.publish(
        buildSystemErrorNotification({
          companyId: request.user?.companyId ?? null,
          source: 'database',
          statusCode,
          message,
          path: request.url,
        }),
      );
    }

    host.switchToHttp().getResponse<Response>().status(statusCode).json({ statusCode, message });
    return statusCode;
  }
}
