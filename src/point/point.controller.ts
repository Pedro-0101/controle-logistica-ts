import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { PointService } from './point.service.js';
import { CreatePointDto } from './dto/create-point.schema.js';
import { UpdatePointDto } from './dto/update-point.schema.js';
import { PointResponseDto } from './dto/point-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Points')
@ApiBearerAuth()
@Controller('point')
export class PointController {
  constructor(private readonly pointService: PointService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar ponto',
    description: 'Cria um novo ponto (ex.: portão) vinculado a uma unidade administrativa.',
  })
  @ZodResponse({ status: 201, type: PointResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  create(
    @Body(new ZodValidationPipe(CreatePointDto)) createPointDto: CreatePointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pointService.create(createPointDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar pontos',
    description: 'Retorna os pontos da empresa do usuário autenticado.',
  })
  @ZodResponse({ status: 200, type: [PointResponseDto] })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.pointService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar ponto por ID',
    description: 'Retorna os dados de um ponto específico pelo seu UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do ponto',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: PointResponseDto })
  @ApiResponse({ status: 404, description: 'Ponto não encontrado' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pointService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar ponto',
    description: 'Atualiza parcialmente os dados de um ponto existente.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do ponto',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: PointResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Ponto não encontrado' })
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
    description: 'Remove permanentemente um ponto do sistema.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do ponto',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({ status: 404, description: 'Ponto não encontrado' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pointService.remove(id, user);
  }
}
