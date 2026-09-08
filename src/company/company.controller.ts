import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { CompanyService } from './company.service.js';
import { CreateCompanyDto } from './dto/create-company.schema.js';
import { UpdateCompanyDto } from './dto/update-company.schema.js';
import { CreateCompanyResponseDto } from './dto/create-company-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar empresa',
    description:
      'Cria uma nova empresa e, na mesma requisição, o usuário administrador vinculado a ela. Apenas o usuário root pode executar esta operação.',
  })
  @ZodResponse({ status: 201, type: CreateCompanyResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 403, description: 'Proibido para usuários não-root' })
  @ApiResponse({
    status: 409,
    description: 'Empresa já possui um administrador',
  })
  create(
    @Body(new ZodValidationPipe(CreateCompanyDto)) createCompanyDto: CreateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyService.create(createCompanyDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar empresas',
    description:
      'Retorna todas as empresas para o usuário root, ou apenas a própria empresa para os demais usuários.',
  })
  @ZodResponse({ status: 200, type: [CreateCompanyDto] })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.companyService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar empresa por ID',
    description: 'Retorna os dados de uma empresa específica pelo seu UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CreateCompanyDto })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.companyService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar empresa',
    description: 'Atualiza parcialmente os dados de uma empresa existente.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CreateCompanyDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCompanyDto)) updateCompanyDto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyService.update(id, updateCompanyDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover empresa',
    description: 'Remove permanentemente uma empresa do sistema.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.companyService.remove(id, user);
  }
}
