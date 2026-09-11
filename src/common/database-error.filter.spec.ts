import type { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
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
});
