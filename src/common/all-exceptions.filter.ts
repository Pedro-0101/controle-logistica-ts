import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Request, Response } from 'express';
import { NotificationEventsService } from '../notification/notification-events.service.js';
import { buildSystemErrorNotification, errorMessageOf } from '../notification/notification-event.factory.js';
import { DatabaseErrorFilter } from './database-error.filter.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly notifications: NotificationEventsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof QueryFailedError) {
      new DatabaseErrorFilter(this.notifications).catch(exception, host);
      return;
    }

    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { user?: { companyId?: string | null } }>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    if (status >= 500) {
      const message = errorMessageOf(exception);
      this.logger.error(`${request.method} ${request.url} falhou: ${message}`);
      this.notifications.publish(
        buildSystemErrorNotification({
          companyId: request.user?.companyId ?? null,
          source: 'http',
          statusCode: status,
          message,
          path: request.url,
        }),
      );
    }

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message: 'Erro interno do servidor' };
    response.status(status).json(body);
  }
}
