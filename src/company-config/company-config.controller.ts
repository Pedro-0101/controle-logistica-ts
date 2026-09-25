import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { CompanyConfigService } from './company-config.service.js';
import { UpdateCompanyConfigDto } from './dto/update-company-config.schema.js';
import { CompanyConfigResponseDto } from './dto/company-config-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { COMPANY_CONFIG_DOCS } from './company-config.docs.js';

@ApiTags('Company Config')
@ApiBearerAuth()
@Controller('company-config')
export class CompanyConfigController {
  constructor(private readonly configService: CompanyConfigService) {}

  @Get(':companyId')
  @ApiOperation({
    summary: 'Buscar configuração da empresa',
    description: COMPANY_CONFIG_DOCS.findOne,
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CompanyConfigResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão para acessar a configuração desta empresa' })
  @ApiResponse({ status: 404, description: 'Configuração não encontrada para a empresa informada' })
  findOne(
    @Param('companyId') companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configService.findOne(companyId, user);
  }

  @Patch(':companyId')
  @ApiOperation({
    summary: 'Atualizar configuração da empresa',
    description: COMPANY_CONFIG_DOCS.update,
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa cuja configuração será atualizada',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CompanyConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos (valores fora dos limites, tipos incorretos)' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão de admin na empresa' })
  @ApiResponse({ status: 404, description: 'Configuração não encontrada para a empresa informada' })
  update(
    @Param('companyId') companyId: string,
    @Body(new ZodValidationPipe(UpdateCompanyConfigDto)) updateDto: UpdateCompanyConfigDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configService.update(companyId, updateDto, user);
  }
}
