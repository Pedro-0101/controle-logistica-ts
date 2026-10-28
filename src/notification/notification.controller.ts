import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ZodQuery, ZodResponse, ZodValidationPipe } from 'zod-nest';
import { NotificationService } from './notification.service.js';
import { FindNotificationsDto } from './dto/find-notifications.schema.js';
import {
  NotificationCatalogResponseDto,
  NotificationItemDto,
  PaginatedNotificationsResponseDto,
  UnreadCountResponseDto,
  MarkAllReadResponseDto,
  NotificationPreferencesResponseDto,
  CompanyNotificationSettingsResponseDto,
} from './dto/notification-response.schema.js';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.schema.js';
import { UpdateCompanyNotificationSettingsDto } from './dto/update-company-notification-settings.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('catalog')
  @ApiOperation({
    summary: 'Catálogo de eventos e filtros de notificação',
    description:
      'Retorna os eventos disponíveis, labels, defaults e definições de filtros para montar a tela de preferências.',
  })
  @ZodResponse({ status: 200, type: NotificationCatalogResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  catalog() {
    return this.notificationService.catalog();
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Preferências de notificação do usuário autenticado',
    description:
      'Retorna a preferência efetiva (usuário > empresa > catálogo), a sobrescrita do usuário e os filtros disponíveis no escopo dele.',
  })
  @ZodResponse({ status: 200, type: NotificationPreferencesResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.getPreferences(user);
  }

  @Put('preferences')
  @ApiOperation({
    summary: 'Atualizar preferências de notificação do usuário autenticado',
    description:
      'Faz upsert em lote. `enabled`/`filters` nulos removem a sobrescrita e voltam a herdar da empresa.',
  })
  @ZodResponse({ status: 200, type: NotificationPreferencesResponseDto })
  @ApiResponse({ status: 400, description: 'Filtros inválidos para o evento' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Evento ou filtro fora do escopo do usuário' })
  updatePreferences(
    @Body(new ZodValidationPipe(UpdateNotificationPreferencesDto))
    dto: UpdateNotificationPreferencesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationService.updatePreferences(user, dto);
  }

  @Get('company-settings/:companyId')
  @ApiOperation({
    summary: 'Configurações de notificação da empresa',
    description:
      'Disponível para o admin da empresa e para administradores globais. Retorna defaults e filtros disponíveis.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CompanyNotificationSettingsResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Usuário não é admin da empresa' })
  getCompanySettings(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationService.getCompanySettings(companyId, user);
  }

  @Put('company-settings/:companyId')
  @ApiOperation({
    summary: 'Atualizar configurações de notificação da empresa',
    description:
      'Define os defaults por evento e se o usuário pode sobrescrevê-los. Apenas admin da empresa ou root.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CompanyNotificationSettingsResponseDto })
  @ApiResponse({ status: 400, description: 'Filtros inválidos para o evento' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Usuário não é admin da empresa' })
  updateCompanySettings(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body(new ZodValidationPipe(UpdateCompanyNotificationSettingsDto))
    dto: UpdateCompanyNotificationSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationService.updateCompanySettings(companyId, dto, user);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Contador de notificações não lidas do usuário' })
  @ZodResponse({ status: 200, type: UnreadCountResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.unreadCount(user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar notificações do usuário (paginado)' })
  @ZodQuery(FindNotificationsDto.schema)
  @ZodResponse({ status: 200, type: PaginatedNotificationsResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  findAll(
    @Query(new ZodValidationPipe(FindNotificationsDto))
    filters: FindNotificationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationService.findAll(user, filters);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marcar todas as notificações do usuário como lidas' })
  @ZodResponse({ status: 201, type: MarkAllReadResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.markAllRead(user);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Marcar uma notificação como lida' })
  @ApiParam({
    name: 'id',
    description: 'UUID da notificação',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 201, type: NotificationItemDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Notificação não encontrada' })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationService.markRead(id, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover uma notificação do usuário' })
  @ApiParam({
    name: 'id',
    description: 'UUID da notificação',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({ status: 200, description: 'Notificação removida' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Notificação não encontrada' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationService.remove(id, user);
  }
}
