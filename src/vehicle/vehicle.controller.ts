import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { VehicleService } from './vehicle.service.js';
import { CreateVehicleDto } from './dto/create-vehicle.schema.js';
import { UpdateVehicleDto } from './dto/update-vehicle.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar veículo',
    description: 'Cria um novo veículo vinculado à empresa do usuário autenticado.',
  })
  @ZodResponse({ status: 201, type: CreateVehicleDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  create(
    @Body(new ZodValidationPipe(CreateVehicleDto)) createVehicleDto: CreateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleService.create(createVehicleDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar veículos',
    description: 'Retorna os veículos da empresa do usuário autenticado.',
  })
  @ZodResponse({ status: 200, type: [CreateVehicleDto] })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.vehicleService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar veículo por ID',
    description: 'Retorna os dados de um veículo específico pelo seu UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do veículo',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CreateVehicleDto })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehicleService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar veículo',
    description: 'Atualiza parcialmente os dados de um veículo existente.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do veículo',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CreateVehicleDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateVehicleDto)) updateVehicleDto: UpdateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleService.update(id, updateVehicleDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover veículo',
    description: 'Remove permanentemente um veículo do sistema.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do veículo',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehicleService.remove(id, user);
  }
}
