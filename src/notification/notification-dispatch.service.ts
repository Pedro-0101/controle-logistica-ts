import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository, type FindOptionsWhere } from 'typeorm';
import type { Subscription } from 'rxjs';
import { Notification } from './entities/notification.entity.js';
import { CompanyNotificationSetting } from './entities/company-notification-setting.entity.js';
import { UserNotificationPreference } from './entities/user-notification-preference.entity.js';
import { User } from '../user/entities/user.entity.js';
import { NotificationEventsService } from './notification-events.service.js';
import {
  getNotificationEventDefinition,
  type NotificationEvent,
} from './notification-events.js';
import { matchesNotificationFilters } from './notification-filter.matcher.js';
import { resolveNotificationPreference } from './notification-preferences.js';

const DEDUPE_PRUNE_THRESHOLD = 1_000;

@Injectable()
export class NotificationDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatchService.name);
  private readonly dedupe = new Map<string, number>();
  private subscription?: Subscription;

  constructor(
    private readonly configService: ConfigService,
    private readonly events: NotificationEventsService,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(CompanyNotificationSetting)
    private readonly companySettings: Repository<CompanyNotificationSetting>,
    @InjectRepository(UserNotificationPreference)
    private readonly userPreferences: Repository<UserNotificationPreference>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  onModuleInit(): void {
    this.subscription = this.events.events$.subscribe((event) => {
      void this.dispatch(event);
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private get enabled(): boolean {
    return this.configService.get<string>('NOTIFICATIONS_ENABLED') !== 'false';
  }

  async dispatch(event: NotificationEvent): Promise<void> {
    if (!this.enabled) return;

    try {
      const definition = getNotificationEventDefinition(event.type);
      const windowSeconds =
        event.dedupeWindowSeconds ?? definition.dedupeWindowSeconds ?? 0;
      if (this.isDuplicate(event, windowSeconds)) return;

      const recipients = await this.resolveRecipients(event);
      if (recipients.length === 0) return;

      const companySetting = event.companyId
        ? await this.companySettings.findOneBy({
            companyId: event.companyId,
            eventType: event.type,
          })
        : null;

      const preferences = await this.userPreferences.find({
        where: { userId: In(recipients.map((user) => user.id)), eventType: event.type },
      });
      const preferenceByUser = new Map(preferences.map((item) => [item.userId, item]));

      const rows = recipients.flatMap((user) => {
        const resolved = resolveNotificationPreference(
          event.type,
          user.companyId === null ? null : companySetting,
          preferenceByUser.get(user.id) ?? null,
        );
        if (!resolved.enabled) return [];
        if (!matchesNotificationFilters(event, resolved.filters)) return [];

        return [
          this.notifications.create({
            companyId: event.companyId,
            userId: user.id,
            eventType: event.type,
            severity: event.severity,
            title: event.title,
            body: event.body,
            payload: event.payload as unknown as Record<string, unknown>,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            pointId: event.pointId,
            cameraId: event.cameraId,
            dedupeKey: event.dedupeKey ?? this.defaultDedupeKey(event),
            readAt: null,
          }),
        ];
      });

      if (rows.length === 0) return;
      await this.notifications.save(rows);
    } catch (error) {
      this.logger.warn(
        `Falha ao despachar notificação ${event.type}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async resolveRecipients(event: NotificationEvent): Promise<User[]> {
    const where: FindOptionsWhere<User> = event.companyId
      ? { companyId: event.companyId }
      : { companyId: IsNull() };

    const recipients = await this.users.find({ where, select: { id: true, companyId: true } });

    if (event.type === 'system.error' && event.companyId) {
      const rootUsers = await this.users.find({
        where: { companyId: IsNull() },
        select: { id: true, companyId: true },
      });
      const known = new Set(recipients.map((user) => user.id));
      for (const user of rootUsers) {
        if (!known.has(user.id)) {
          recipients.push(user);
          known.add(user.id);
        }
      }
    }

    return recipients;
  }

  private isDuplicate(event: NotificationEvent, windowSeconds: number): boolean {
    if (windowSeconds <= 0) return false;

    const now = Date.now();
    if (this.dedupe.size > DEDUPE_PRUNE_THRESHOLD) this.pruneDedupe(now);

    const key = event.dedupeKey ?? this.defaultDedupeKey(event);
    const expiresAt = this.dedupe.get(key);
    if (expiresAt !== undefined && expiresAt > now) return true;

    this.dedupe.set(key, now + windowSeconds * 1000);
    return false;
  }

  private pruneDedupe(now: number): void {
    for (const [key, expiresAt] of this.dedupe) {
      if (expiresAt <= now) this.dedupe.delete(key);
    }
  }

  private defaultDedupeKey(event: NotificationEvent): string {
    const company = event.companyId ?? 'global';
    switch (event.type) {
      case 'movement.registered':
        return `${event.type}:${event.payload.movementId}:${event.payload.action}`;
      case 'external_api.usage':
        return [
          event.type,
          company,
          event.payload.provider,
          event.payload.outcome,
          event.payload.pointId ?? '-',
          event.payload.cameraId ?? '-',
        ].join(':');
      case 'camera.error':
        return [
          event.type,
          company,
          event.payload.cameraId ?? '-',
          event.payload.kind,
        ].join(':');
      case 'system.error':
        return [event.type, company, event.payload.source, hash(event.payload.message)].join(':');
    }
  }
}

function hash(value: string): string {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result).toString(36);
}
