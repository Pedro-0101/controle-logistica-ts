import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodQuery, ZodResponse, ZodValidationPipe } from 'zod-nest';
import { ReportsService } from './reports.service.js';
import { FindReportDto, FindVehicleTimelineDto, FindMovementBookDto, type FindMovementBookDtoType, type FindReportDtoType } from './dto/find-report.schema.js';
import {
  DwellReportResponseDto,
  ExceptionsResponseDto,
  FleetStatusResponseDto,
  MovementBookResponseDto,
  TransitReportResponseDto,
  UtilizationReportResponseDto,
  VehicleTimelineResponseDto,
} from './dto/report-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('vehicle-timeline')
  @ApiOperation({
    summary: 'Linha do tempo de permanência e trânsito por veículo',
    description:
      'Reconstrói a linha do tempo dos veículos da frota própria no período, com segmentos de ' +
      '**permanência** (entrada→saída na mesma unidade) e **trânsito** (saída de uma unidade → ' +
      'entrada na seguinte). Inclui baseline histórico da rota e marcação de pernoites fora da jornada.',
  })
  @ZodQuery(FindVehicleTimelineDto.schema)
  @ZodResponse({ status: 200, type: VehicleTimelineResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Usuário sem empresa vinculada' })
  vehicleTimeline(
    @Query(new ZodValidationPipe(FindVehicleTimelineDto)) filters: FindReportDtoType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getVehicleTimeline(user, filters);
  }

  @Get('movement-book')
  @ApiOperation({
    summary: 'Livro de movimentação (base dos relatórios)',
    description:
      'Livro de movimentação enriquecido com o tempo calculado de cada evento: permanência para ' +
      'entradas pareadas e trânsito para saídas com destino. Use `format=csv` para exportar.',
  })
  @ZodQuery(FindMovementBookDto.schema)
  @ZodResponse({ status: 200, type: MovementBookResponseDto })
  @ApiProduces('application/json')
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Usuário sem empresa vinculada' })
  async movementBook(
    @Query(new ZodValidationPipe(FindMovementBookDto)) filters: FindMovementBookDtoType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const book = await this.reportsService.getMovementBook(user, filters);
    if (filters.format === 'csv') {
      const buffer = Buffer.from(this.reportsService.toCsv(book), 'utf-8');
      return new StreamableFile(buffer, {
        type: 'text/csv; charset=utf-8',
        disposition: 'attachment; filename="livro-movimentacao.csv"',
      });
    }
    return book;
  }

  @Get('fleet-status')
  @ApiOperation({
    summary: 'Posição atual da frota',
    description:
      'Mostra onde cada veículo da frota própria está agora: dentro de qual unidade (com a ' +
      'permanência corrente) ou em trânsito desde a última saída.',
  })
  @ZodResponse({ status: 200, type: FleetStatusResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Usuário sem empresa vinculada' })
  fleetStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getFleetStatus(user);
  }

  @Get('dwell')
  @ApiOperation({
    summary: 'Relatório de permanência',
    description:
      'Tempo de permanência agregado por veículo e por unidade (média, mediana, p95, mínimo, máximo).',
  })
  @ZodQuery(FindReportDto.schema)
  @ZodResponse({ status: 200, type: DwellReportResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Usuário sem empresa vinculada' })
  dwell(
    @Query(new ZodValidationPipe(FindReportDto)) filters: FindReportDtoType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getDwellReport(user, filters);
  }

  @Get('transit')
  @ApiOperation({
    summary: 'Relatório de trânsito por rota',
    description:
      'Tempo de trânsito agregado por rota (unidade origem → destino), com média, p95 e nº de viagens.',
  })
  @ZodQuery(FindReportDto.schema)
  @ZodResponse({ status: 200, type: TransitReportResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Usuário sem empresa vinculada' })
  transit(
    @Query(new ZodValidationPipe(FindReportDto)) filters: FindReportDtoType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getTransitReport(user, filters);
  }

  @Get('utilization')
  @ApiOperation({
    summary: 'Utilização da frota',
    description:
      'Distribuição do tempo de cada veículo entre permanência, trânsito e sem registro, no período.',
  })
  @ZodQuery(FindReportDto.schema)
  @ZodResponse({ status: 200, type: UtilizationReportResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Usuário sem empresa vinculada' })
  utilization(
    @Query(new ZodValidationPipe(FindReportDto)) filters: FindReportDtoType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getUtilizationReport(user, filters);
  }

  @Get('exceptions')
  @ApiOperation({
    summary: 'Exceções de tempo',
    description:
      'Lista anomalias: permanência aberta acima do limite, entrada sem saída, saída sem chegada, ' +
      'trânsito acima do p95 da rota e trânsitos que cruzam fora da jornada (pernoite).',
  })
  @ZodQuery(FindReportDto.schema)
  @ZodResponse({ status: 200, type: ExceptionsResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Usuário sem empresa vinculada' })
  exceptions(
    @Query(new ZodValidationPipe(FindReportDto)) filters: FindReportDtoType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getExceptions(user, filters);
  }
}
