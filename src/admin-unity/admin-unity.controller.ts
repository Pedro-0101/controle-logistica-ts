import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { AdminUnityService } from './admin-unity.service.js';
import { CreateAdminUnityDto } from './dto/create-admin-unity.schema.js';
import { UpdateAdminUnityDto } from './dto/update-admin-unity.schema.js';
import { AdminUnityResponseDto } from './dto/admin-unity-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Admin Units')
@ApiBearerAuth()
@Controller('admin-unity')
export class AdminUnityController {
  constructor(private readonly adminUnityService: AdminUnityService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar unidade administrativa',
    description: 'Cria uma nova unidade administrativa vinculada à empresa do usuário autenticado.',
  })
  @ZodResponse({ status: 201, type: AdminUnityResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  create(
    @Body(new ZodValidationPipe(CreateAdminUnityDto)) createAdminUnityDto: CreateAdminUnityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminUnityService.create(createAdminUnityDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar unidades administrativas',
    description: 'Retorna as unidades administrativas da empresa do usuário autenticado.',
  })
  @ZodResponse({ status: 200, type: [AdminUnityResponseDto] })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.adminUnityService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar unidade administrativa por ID',
    description: 'Retorna os dados de uma unidade administrativa específica pelo seu UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da unidade administrativa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: AdminUnityResponseDto })
  @ApiResponse({ status: 404, description: 'Unidade não encontrada' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminUnityService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar unidade administrativa',
    description: 'Atualiza parcialmente os dados de uma unidade administrativa existente.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da unidade administrativa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: AdminUnityResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Unidade não encontrada' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAdminUnityDto)) updateAdminUnityDto: UpdateAdminUnityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminUnityService.update(id, updateAdminUnityDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover unidade administrativa',
    description: 'Remove permanentemente uma unidade administrativa do sistema.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da unidade administrativa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({ status: 404, description: 'Unidade não encontrada' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminUnityService.remove(id, user);
  }
}
