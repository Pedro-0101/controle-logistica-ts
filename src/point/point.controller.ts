import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { PointService } from './point.service.js';
import { CreatePointDto } from './dto/create-point.schema.js';
import { UpdatePointDto } from './dto/update-point.schema.js';
import { PointResponseDto } from './dto/point-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { POINT_DOCS } from './point.docs.js';

@ApiTags('Points')
@ApiBearerAuth()
@Controller('point')
export class PointController {
  constructor(private readonly pointService: PointService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar ponto de entrada/saída',
    description: POINT_DOCS.create,
  })
  @ZodResponse({ status: 201, type: PointResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos (nome, código ou UUID da unidade ausentes/inválidos)' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão de admin na empresa' })
  @ApiResponse({ status: 409, description: 'Já existe um ponto com o mesmo código (code) na empresa' })
  create(
    @Body(new ZodValidationPipe(CreatePointDto)) createPointDto: CreatePointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pointService.create(createPointDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar pontos da empresa',
    description: POINT_DOCS.findAll,
  })
  @ZodResponse({ status: 200, type: [PointResponseDto] })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.pointService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar ponto por ID',
    description: POINT_DOCS.findOne,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do ponto',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: PointResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 404, description: 'Ponto não encontrado ou não pertence à empresa do usuário' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pointService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar ponto (parcial)',
    description: POINT_DOCS.update,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do ponto a ser atualizado',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: PointResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos ou tentativa de alterar campo fixo (adminUnityId)' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão de admin na empresa' })
  @ApiResponse({ status: 404, description: 'Ponto não encontrado ou não pertence à empresa do usuário' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePointDto)) updatePointDto: UpdatePointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pointService.update(id, updatePointDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover ponto',
    description: POINT_DOCS.remove,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do ponto a ser removido',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({ status: 200, description: 'Ponto removido com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão de admin na empresa' })
  @ApiResponse({ status: 404, description: 'Ponto não encontrado ou não pertence à empresa do usuário' })
  @ApiResponse({ status: 409, description: 'Ponto possui câmeras ou movimentações vinculadas' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pointService.remove(id, user);
  }
}
