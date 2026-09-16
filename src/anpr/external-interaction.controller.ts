import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodQuery, ZodResponse, ZodValidationPipe } from 'zod-nest';
import { ExternalInteractionService } from './external-interaction.service.js';
import {
  FindExternalInteractionsDto,
} from './dto/find-external-interactions.schema.js';
import {
  ExternalInteractionUsageDto,
  PaginatedExternalInteractionsDto,
} from './dto/external-interaction-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('ANPR')
@ApiBearerAuth()
@Controller('anpr/external-interactions')
export class ExternalInteractionController {
  constructor(private readonly externalInteractionService: ExternalInteractionService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar interações com a API externa de reconhecimento',
    description:
      'Retorna as chamadas feitas às APIs externas de reconhecimento (ex.: Google Vision), ' +
      'com latência, status HTTP, unidades cobráveis e custo estimado.\n\n' +
      'Inclui um resumo agregado do período filtrado (total de chamadas, sucessos, falhas, ' +
      'latência média/p95 e custo total).\n\n' +
      '**Filtros:** provider, mode, outcome, finalSource, cameraId, observationId, dateFrom, dateTo.',
  })
  @ZodQuery(FindExternalInteractionsDto.schema)
  @ZodResponse({ status: 200, type: PaginatedExternalInteractionsDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  findAll(
    @Query(new ZodValidationPipe(FindExternalInteractionsDto))
    filters: FindExternalInteractionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.externalInteractionService.findAll(user, filters);
  }

  @Get('usage')
  @ApiOperation({
    summary: 'Uso global da API externa (somente admin raiz)',
    description:
      'Visão consolidada do uso das APIs externas de reconhecimento em **todas as empresas**.\n\n' +
      '**Restrito ao administrador global** (`companyId = null`). Usuários vinculados a uma empresa ' +
      'recebem `403` — estes devem usar `GET /anpr/external-interactions`, que já é limitado ao escopo da empresa.\n\n' +
      'Retorna:\n' +
      '- `data`: interações da página atual (todas as empresas)\n' +
      '- `meta`: paginação\n' +
      '- `summary`: totais do período (chamadas, sucessos, falhas, latência média/p95, custo)\n' +
      '- `byCompany`: agregado por empresa (chamadas, sucesso/falhas, latência média, custo), ordenado por volume\n\n' +
      '**Filtros:** `companyId`, `provider`, `mode`, `outcome`, `finalSource`, `cameraId`, `observationId`, `dateFrom`, `dateTo`.',
  })
  @ZodQuery(FindExternalInteractionsDto.schema)
  @ZodResponse({ status: 200, type: ExternalInteractionUsageDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Apenas o administrador global (company_id = null) pode acessar' })
  findUsage(
    @Query(new ZodValidationPipe(FindExternalInteractionsDto))
    filters: FindExternalInteractionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.externalInteractionService.findUsage(user, filters);
  }
}
