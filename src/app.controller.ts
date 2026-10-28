import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ZodQuery, ZodValidationPipe } from 'zod-nest';
import { AppService } from './app.service.js';
import { Public } from './auth/decorators/public.decorator.js';
import { StatsQueryDto } from './stats/dto/stats-query.schema.js';

@ApiTags('Stats')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('stats')
  @ApiOperation({
    summary: 'Estatísticas do sistema',
    description:
      'Retorna monitores e observações, métricas de captura/fila/inferência do Python e registro automático no Nest. Durações e janelas são descritas na resposta; serviço indisponível é indicado explicitamente, sem simular métricas zeradas.\n\n' +
      '**Filtros:** `companyId` restringe monitores, observações e métricas por câmera; `dateFrom`/`dateTo` restringem as observações confirmadas. Contadores globais do ANPR e do registro automático não são afetados pelos filtros.',
  })
  @ZodQuery(StatsQueryDto.schema)
  @ApiResponse({ status: 200, description: 'Estatísticas do sistema retornadas com sucesso' })
  getStats(
    @Query(new ZodValidationPipe(StatsQueryDto))
    query: StatsQueryDto,
  ) {
    return this.appService.getStats(query);
  }
}
