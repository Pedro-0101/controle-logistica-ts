import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './auth/decorators/public.decorator.js';

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
    description: 'Retorna dados de monitoramento ANPR: monitores ativos, observações confirmadas com placa, confiança e status.',
  })
  @ApiResponse({ status: 200, description: 'Estatísticas do sistema retornadas com sucesso' })
  @ApiResponse({ status: 502, description: 'Serviço ANPR indisponível' })
  getStats() {
    return this.appService.getStats();
  }
}
