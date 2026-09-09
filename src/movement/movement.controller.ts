import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { MovementService } from './movement.service.js';
import { CreateMovementDto } from './dto/create-movement.schema.js';
import { CreateMovementFromCameraDto } from './dto/create-movement-from-camera.schema.js';
import { UpdateMovementDto } from './dto/update-movement.schema.js';
import { MovementResponseDto } from './dto/movement-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Movements')
@ApiBearerAuth()
@Controller('movement')
export class MovementController {
  constructor(private readonly movementService: MovementService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar movimento',
    description: 'Registra a entrada ou saída de um veículo em uma unidade administrativa.',
  })
  @ZodResponse({ status: 201, type: MovementResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Dados de entrada inválidos',
  })
  create(
    @Body(new ZodValidationPipe(CreateMovementDto)) createMovementDto: CreateMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementService.create(createMovementDto, user);
  }

  @Post('from-camera')
  @ApiOperation({
    summary: 'Criar movimento a partir da câmera (ANPR)',
    description:
      'Captura o snapshot da câmera, reconhece a placa do veículo e registra a entrada ou saída.',
  })
  @ZodResponse({ status: 201, type: MovementResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Câmera não encontrada' })
  @ApiResponse({ status: 422, description: 'Placa não reconhecida na imagem' })
  @ApiResponse({ status: 502, description: 'Falha ao capturar imagem da câmera' })
  createFromCamera(
    @Body(new ZodValidationPipe(CreateMovementFromCameraDto))
    createMovementFromCameraDto: CreateMovementFromCameraDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementService.createFromCamera(createMovementFromCameraDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar todos os movimentos',
    description: 'Retorna uma lista com todos os movimentos registrados no sistema.',
  })
  @ZodResponse({ status: 200, type: [MovementResponseDto] })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.movementService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar movimento por ID',
    description: 'Retorna os dados de um movimento específico pelo seu UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do movimento',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: MovementResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Movimento não encontrado',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.movementService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar movimento',
    description: 'Atualiza parcialmente os dados de um movimento existente. Todos os campos são opcionais.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do movimento',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: MovementResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Dados de entrada inválidos',
  })
  @ApiResponse({
    status: 404,
    description: 'Movimento não encontrado',
  })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMovementDto)) updateMovementDto: UpdateMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementService.update(id, updateMovementDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover movimento',
    description: 'Remove permanentemente um movimento do sistema.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do movimento',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({
    status: 200,
    description: 'Movimento removido com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Movimento não encontrado',
  })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.movementService.remove(id, user);
  }
}
