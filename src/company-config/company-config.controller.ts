import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { CompanyConfigService } from './company-config.service.js';
import { UpdateCompanyConfigDto } from './dto/update-company-config.schema.js';
import { CompanyConfigResponseDto } from './dto/company-config-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Company Config')
@ApiBearerAuth()
@Controller('company-config')
export class CompanyConfigController {
  constructor(private readonly configService: CompanyConfigService) {}

  @Get(':companyId')
  @ApiOperation({
    summary: 'Buscar configuração da empresa',
    description: 'Retorna as configurações da empresa especificada pelo UUID.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CompanyConfigResponseDto })
  @ApiResponse({ status: 404, description: 'Configuração não encontrada' })
  findOne(
    @Param('companyId') companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configService.findOne(companyId, user);
  }

  @Patch(':companyId')
  @ApiOperation({
    summary: 'Atualizar configuração da empresa',
    description: 'Atualiza parcialmente as configurações da empresa existente.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CompanyConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Configuração não encontrada' })
  update(
    @Param('companyId') companyId: string,
    @Body(new ZodValidationPipe(UpdateCompanyConfigDto)) updateDto: UpdateCompanyConfigDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configService.update(companyId, updateDto, user);
  }
}
