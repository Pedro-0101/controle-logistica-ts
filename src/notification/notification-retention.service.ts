import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity.js';

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class NotificationRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.purge();
    }, PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async purge(): Promise<number> {
    if (this.configService.get<string>('NOTIFICATIONS_ENABLED') === 'false') return 0;

    try {
      const readDays = this.days('NOTIFICATION_READ_RETENTION_DAYS', 30);
      const unreadDays = this.days('NOTIFICATION_UNREAD_RETENTION_DAYS', 90);
      const now = Date.now();
      const readCutoff = new Date(now - readDays * 24 * 60 * 60 * 1000);
      const unreadCutoff = new Date(now - unreadDays * 24 * 60 * 60 * 1000);

      const result = await this.notifications
        .createQueryBuilder()
        .delete()
        .where('("readAt" IS NOT NULL AND "createdAt" < :readCutoff)', { readCutoff })
        .orWhere('("readAt" IS NULL AND "createdAt" < :unreadCutoff)', { unreadCutoff })
        .execute();

      return result.affected ?? 0;
    } catch (error) {
      this.logger.warn(
        `Falha ao expurgar notificações: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  private days(key: string, fallback: number): number {
    const parsed = Number(this.configService.get<string>(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
