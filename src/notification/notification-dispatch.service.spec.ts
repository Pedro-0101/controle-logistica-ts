import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Subject } from 'rxjs';
import { NotificationDispatchService } from './notification-dispatch.service.js';
import { NotificationEventsService } from './notification-events.service.js';
import { buildSystemErrorNotification } from './notification-event.factory.js';
import { Notification } from './entities/notification.entity.js';
import { CompanyNotificationSetting } from './entities/company-notification-setting.entity.js';
import { UserNotificationPreference } from './entities/user-notification-preference.entity.js';
import { User } from '../user/entities/user.entity.js';

describe('NotificationDispatchService', () => {
  let service: NotificationDispatchService;

  const notificationsRepo = {
    create: vi.fn((value: unknown) => value),
    save: vi.fn(async (rows: unknown) => rows),
  };
  const companySettingsRepo = { findOneBy: vi.fn() };
  const userPreferencesRepo = { find: vi.fn() };
  const usersRepo = { find: vi.fn() };
  const configService = { get: vi.fn() };
  const eventsService = { events$: new Subject() };

  beforeEach(async () => {
    vi.clearAllMocks();
    configService.get.mockReturnValue(undefined);
    userPreferencesRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: ConfigService, useValue: configService },
        { provide: NotificationEventsService, useValue: eventsService },
        { provide: getRepositoryToken(Notification), useValue: notificationsRepo },
        {
          provide: getRepositoryToken(CompanyNotificationSetting),
          useValue: companySettingsRepo,
        },
        {
          provide: getRepositoryToken(UserNotificationPreference),
          useValue: userPreferencesRepo,
        },
        { provide: getRepositoryToken(User), useValue: usersRepo },
      ],
    }).compile();

    service = module.get<NotificationDispatchService>(NotificationDispatchService);
  });

  it('não aplica o desligamento da empresa às notificações do usuário root', async () => {
    companySettingsRepo.findOneBy.mockResolvedValue({
      enabled: false,
      defaultFilters: {},
      allowUserOverride: true,
    });
    usersRepo.find
      .mockResolvedValueOnce([{ id: 'company-user', companyId: 'company-1' }])
      .mockResolvedValueOnce([{ id: 'root-user', companyId: null }]);

    await service.dispatch(
      buildSystemErrorNotification({
        companyId: 'company-1',
        source: 'http',
        statusCode: 500,
        message: 'Falha',
      }),
    );

    const rows = notificationsRepo.save.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: 'root-user', companyId: 'company-1' });
  });
});
