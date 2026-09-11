import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Response } from 'express';

@Catch(QueryFailedError)
export class DatabaseErrorFilter implements ExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const code = (exception.driverError as { code?: string }).code;
    const errors: Record<string, [number, string]> = {
      '23505': [409, 'Já existe um registro com esses dados'],
      '23503': [409, 'Registro vinculado a outros dados ou referência inexistente'],
      '22P02': [400, 'Identificador ou valor inválido'],
    };
    const [statusCode, message] = errors[code ?? ''] ?? [500, 'Não foi possível concluir a operação no banco'];
    host.switchToHttp().getResponse<Response>().status(statusCode).json({ statusCode, message });
  }
}
