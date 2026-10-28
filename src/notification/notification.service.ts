import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  type FindOptionsWhere,
} from 'typeorm';
import { Notification } from './entities/notification.entity.js';
import { CompanyNotificationSetting } from './entities/company-notification-setting.entity.js';
import { UserNotificationPreference } from './entities/user-notification-preference.entity.js';
import { User } from '../user/entities/user.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { Camera } from '../camera/entities/camera.entity.js';
import type { Actor } from '../auth/company-scope.js';
import { paginationMeta, paginationSkip } from '../common/pagination.js';
import type { FindNotificationsDtoType } from './dto/find-notifications.schema.js';
import type { UpdateNotificationPreferencesDtoType } from './dto/update-notification-preferences.schema.js';
import type { UpdateCompanyNotificationSettingsDtoType } from './dto/update-company-notification-settings.schema.js';
import {
  NOTIFICATION_EVENT_CATALOG,
  getNotificationEventDefinition,
  safeParseNotificationFilters,
  type NotificationEventType,
  type NotificationFilters,
} from './notification-events.js';
import { resolveNotificationPreference } from './notification-preferences.js';

interface FilterScope {
  pointIds?: string[];
  cameraIds?: string[];
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(CompanyNotificationSetting)
    private readonly companySettings: Repository<CompanyNotificationSetting>,
    @InjectRepository(UserNotificationPreference)
    private readonly userPreferences: Repository<UserNotificationPreference>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Point)
    private readonly points: Repository<Point>,
    @InjectRepository(Camera)
    private readonly cameras: Repository<Camera>,
  ) {}

  async findAll(actor: Actor, filters: FindNotificationsDtoType) {
    const where: FindOptionsWhere<Notification> = { userId: actor.userId };

    if (filters.unreadOnly) where.readAt = IsNull();
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.severity) where.severity = filters.severity;

    const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const to = filters.dateTo ? new Date(filters.dateTo) : null;
    if (from && to) where.createdAt = Between(from, to);
    else if (from) where.createdAt = MoreThanOrEqual(from);
    else if (to) where.createdAt = LessThanOrEqual(to);

    const [rows, total] = await this.notifications.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: paginationSkip(filters.page, filters.limit),
      take: filters.limit,
    });

    return {
      data: rows.map((row) => this.toItem(row)),
      meta: paginationMeta(filters.page, filters.limit, total),
    };
  }

  async unreadCount(actor: Actor) {
    const count = await this.notifications.count({
      where: { userId: actor.userId, readAt: IsNull() },
    });
    return { count };
  }

  async markRead(id: string, actor: Actor) {
    const notification = await this.notifications.findOneBy({ id, userId: actor.userId });
    if (!notification) throw new NotFoundException('Notificação não encontrada');

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }
    return this.toItem(notification);
  }

  async markAllRead(actor: Actor) {
    const result = await this.notifications.update(
      { userId: actor.userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  async remove(id: string, actor: Actor) {
    const result = await this.notifications.delete({ id, userId: actor.userId });
    if (!result.affected) throw new NotFoundException('Notificação não encontrada');
    return { id };
  }

  catalog() {
    return {
      events: NOTIFICATION_EVENT_CATALOG.map((definition) => ({
        ...definition,
        defaultFilters: definition.defaultFilters as Record<string, unknown>,
      })),
    };
  }

  async getPreferences(actor: Actor) {
    const eventTypes = this.allowedEventTypes(actor);

    const [companyRows, userRows, availableFilters] = await Promise.all([
      actor.companyId
        ? this.companySettings.find({
            where: { companyId: actor.companyId, eventType: In(eventTypes) },
          })
        : Promise.resolve([] as CompanyNotificationSetting[]),
      this.userPreferences.find({
        where: { userId: actor.userId, eventType: In(eventTypes) },
      }),
      actor.companyId
        ? this.availableFiltersFor(actor, actor.companyId)
        : Promise.resolve({ points: [], cameras: [] }),
    ]);

    const companyByType = new Map(companyRows.map((row) => [row.eventType, row]));
    const userByType = new Map(userRows.map((row) => [row.eventType, row]));

    return {
      events: eventTypes.map((type) => {
        const company = companyByType.get(type) ?? null;
        const user = userByType.get(type) ?? null;
        const resolved = resolveNotificationPreference(type, company, user);

        return {
          eventType: type,
          enabled: resolved.enabled,
          filters: resolved.filters as Record<string, unknown>,
          source: resolved.source,
          override: user
            ? { enabled: user.enabled, filters: user.filters }
            : null,
          company: company
            ? {
                enabled: company.enabled,
                defaultFilters: company.defaultFilters,
                allowUserOverride: company.allowUserOverride,
              }
            : null,
        };
      }),
      availableFilters,
    };
  }

  async updatePreferences(actor: Actor, dto: UpdateNotificationPreferencesDtoType) {
    const allowed = new Set(this.allowedEventTypes(actor));

    for (const item of dto.items) {
      if (!allowed.has(item.eventType)) {
        throw new ForbiddenException(
          `Evento ${item.eventType} não está disponível para este usuário`,
        );
      }

      const parsedFilters =
        item.filters === undefined
          ? undefined
          : item.filters === null
            ? null
            : this.parseFilters(item.eventType, item.filters);

      if (parsedFilters && actor.companyId) {
        await this.assertFiltersInScope(parsedFilters, actor, actor.companyId);
      }

      let preference = await this.userPreferences.findOneBy({
        userId: actor.userId,
        eventType: item.eventType,
      });
      if (!preference) {
        preference = this.userPreferences.create({
          userId: actor.userId,
          eventType: item.eventType,
          enabled: null,
          filters: null,
        });
      }

      if (item.enabled !== undefined) preference.enabled = item.enabled;
      if (item.filters !== undefined) {
        preference.filters = parsedFilters as Record<string, unknown> | null;
      }
      await this.userPreferences.save(preference);
    }

    return this.getPreferences(actor);
  }

  async getCompanySettings(companyId: string, actor: Actor) {
    this.assertCompanyAdmin(companyId, actor);

    const rows = await this.companySettings.find({ where: { companyId } });
    const byType = new Map(rows.map((row) => [row.eventType, row]));

    return {
      companyId,
      events: NOTIFICATION_EVENT_CATALOG.map((definition) => {
        const row = byType.get(definition.type);
        return {
          eventType: definition.type,
          enabled: row?.enabled ?? definition.defaultEnabled,
          defaultFilters:
            row?.defaultFilters ?? (definition.defaultFilters as Record<string, unknown>),
          allowUserOverride: row?.allowUserOverride ?? true,
          isDefault: !row,
        };
      }),
      availableFilters: await this.availableFiltersFor(actor, companyId),
    };
  }

  async updateCompanySettings(
    companyId: string,
    dto: UpdateCompanyNotificationSettingsDtoType,
    actor: Actor,
  ) {
    this.assertCompanyAdmin(companyId, actor);

    for (const item of dto.items) {
      const definition = getNotificationEventDefinition(item.eventType);
      const parsedFilters =
        item.defaultFilters === undefined
          ? undefined
          : item.defaultFilters === null
            ? null
            : this.parseFilters(item.eventType, item.defaultFilters);

      if (parsedFilters) {
        await this.assertFiltersInScope(parsedFilters, actor, companyId);
      }

      let setting = await this.companySettings.findOneBy({
        companyId,
        eventType: item.eventType,
      });
      if (!setting) {
        setting = this.companySettings.create({
          companyId,
          eventType: item.eventType,
          enabled: definition.defaultEnabled,
          defaultFilters: definition.defaultFilters as Record<string, unknown>,
          allowUserOverride: true,
        });
      }

      if (item.enabled !== undefined) setting.enabled = item.enabled;
      if (item.defaultFilters !== undefined) {
        setting.defaultFilters = parsedFilters as Record<string, unknown> | null;
      }
      if (item.allowUserOverride !== undefined) {
        setting.allowUserOverride = item.allowUserOverride;
      }
      await this.companySettings.save(setting);
    }

    return this.getCompanySettings(companyId, actor);
  }

  private allowedEventTypes(actor: Actor): NotificationEventType[] {
    if (!actor.companyId) return ['system.error'];
    return NOTIFICATION_EVENT_CATALOG.map((definition) => definition.type);
  }

  private assertCompanyAdmin(companyId: string, actor: Actor): void {
    if (actor.companyId === null) return;
    if (actor.companyId !== companyId || actor.role !== 'admin') {
      throw new ForbiddenException(
        'Apenas administradores da empresa podem alterar as notificações',
      );
    }
  }

  private parseFilters(type: NotificationEventType, value: unknown): NotificationFilters {
    const parsed = safeParseNotificationFilters(type, value);
    if (!parsed) throw new BadRequestException(`Filtros inválidos para o evento ${type}`);
    return parsed;
  }

  private async assertFiltersInScope(
    filters: NotificationFilters,
    actor: Actor,
    companyId: string,
  ): Promise<void> {
    const scope = filters as FilterScope;
    const available = await this.availableFiltersFor(actor, companyId);

    if (scope.pointIds?.length) {
      const allowed = new Set(available.points.map((point) => point.id));
      if (scope.pointIds.some((id) => !allowed.has(id))) {
        throw new ForbiddenException('Um ou mais pontos estão fora do escopo permitido');
      }
    }

    if (scope.cameraIds?.length) {
      const allowed = new Set(available.cameras.map((camera) => camera.id));
      if (scope.cameraIds.some((id) => !allowed.has(id))) {
        throw new ForbiddenException('Uma ou mais câmeras estão fora do escopo permitido');
      }
    }
  }

  private async availableFiltersFor(actor: Actor, companyId: string) {
    const points = await this.pointsFor(actor, companyId);
    const pointIds = points.map((point) => point.id);

    const cameras = pointIds.length
      ? await this.cameras.find({
          where: { companyId, pointId: In(pointIds) },
          select: { id: true, name: true, pointId: true },
          order: { name: 'ASC' },
        })
      : [];

    return {
      points: points.map((point) => ({ id: point.id, name: point.name, code: point.code })),
      cameras: cameras.map((camera) => ({
        id: camera.id,
        name: camera.name,
        pointId: camera.pointId,
      })),
    };
  }

  private async pointsFor(actor: Actor, companyId: string): Promise<Point[]> {
    if (actor.role === 'user') {
      const user = await this.users.findOne({
        where: { id: actor.userId },
        relations: { points: true },
      });
      if (user?.points?.length) {
        return user.points.filter((point) => point.companyId === companyId && point.active);
      }
    }

    return this.points.find({
      where: { companyId, active: true },
      order: { name: 'ASC' },
    });
  }

  private toItem(row: Notification) {
    return {
      id: row.id,
      companyId: row.companyId,
      userId: row.userId,
      eventType: row.eventType as NotificationEventType,
      severity: row.severity,
      title: row.title,
      body: row.body,
      payload: row.payload ?? {},
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      pointId: row.pointId,
      cameraId: row.cameraId,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
