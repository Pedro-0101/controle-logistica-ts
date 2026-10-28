import type { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { NotificationEventsService } from '../notification/notification-events.service.js';
import { DatabaseErrorFilter } from './database-error.filter.js';

describe('DatabaseErrorFilter', () => {
  it.each([['23505', 409], ['23503', 409], ['22P02', 400], ['other', 500], [undefined, 500]])(
    'maps %s without exposing SQL, parameters or credentials', (code, status) => {
      const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
      const cause = Object.assign(new Error('sensitive password'), { code });
      new DatabaseErrorFilter().catch(new QueryFailedError('secret SQL', ['secret'], cause), host);
      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: status }));
      expect(JSON.stringify(response.json.mock.calls)).not.toMatch(/secret|password|SQL/);
    },
  );

  it('publica erro de sistema apenas para falhas 5xx', () => {
    const publish = vi.fn();
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const request = { url: '/movement', user: { companyId: 'company-1' } };
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as unknown as ArgumentsHost;
    const filter = new DatabaseErrorFilter({ publish } as unknown as NotificationEventsService);

    filter.catch(new QueryFailedError('secret SQL', [], new Error('falha')), host);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system.error',
        companyId: 'company-1',
        payload: expect.objectContaining({ source: 'database', statusCode: 500 }),
      }),
    );

    publish.mockClear();
    const conflict = Object.assign(new Error('duplicado'), { code: '23505' });
    filter.catch(new QueryFailedError('secret SQL', [], conflict), host);
    expect(publish).not.toHaveBeenCalled();
  });
});
