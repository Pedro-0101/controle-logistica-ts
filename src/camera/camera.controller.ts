import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { CameraService } from './camera.service.js';
import { CreateCameraDto } from './dto/create-camera.schema.js';
import { UpdateCameraDto } from './dto/update-camera.schema.js';
import { CameraResponseDto } from './dto/camera-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Cameras')
@ApiBearerAuth()
@Controller('camera')
export class CameraController {
  constructor(private readonly cameraService: CameraService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar câmera',
    description: 'Cria uma nova câmera IP vinculada a uma unidade administrativa.',
  })
  @ZodResponse({ status: 201, type: CameraResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  create(
    @Body(new ZodValidationPipe(CreateCameraDto)) createCameraDto: CreateCameraDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cameraService.create(createCameraDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar câmeras',
    description: 'Retorna as câmeras da empresa do usuário autenticado.',
  })
  @ZodResponse({ status: 200, type: [CameraResponseDto] })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.cameraService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar câmera por ID',
    description: 'Retorna os dados de uma câmera específica pelo seu UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da câmera',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CameraResponseDto })
  @ApiResponse({ status: 404, description: 'Câmera não encontrada' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cameraService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar câmera',
    description: 'Atualiza parcialmente os dados de uma câmera existente.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da câmera',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CameraResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Câmera não encontrada' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCameraDto)) updateCameraDto: UpdateCameraDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cameraService.update(id, updateCameraDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover câmera',
    description: 'Remove permanentemente uma câmera do sistema.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da câmera',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({ status: 404, description: 'Câmera não encontrada' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cameraService.remove(id, user);
  }
}
