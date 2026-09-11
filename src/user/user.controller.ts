import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { UserService } from './user.service.js';
import { CreateUserDto } from './dto/create-user.schema.js';
import { UpdateUserDto } from './dto/update-user.schema.js';
import { LinkPointsDto } from './dto/link-points.schema.js';
import { UserResponseDto } from './dto/user-response.schema.js';
import { PointResponseDto } from '../point/dto/point-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar usuário',
    description: 'Cria um novo usuário no sistema com nome, email, senha, função e empresa vinculada.',
  })
  @ZodResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Dados de entrada inválidos',
  })
  create(
    @Body(new ZodValidationPipe(CreateUserDto)) createUserDto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.create(createUserDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar todos os usuários',
    description: 'Retorna uma lista com todos os usuários cadastrados no sistema.',
  })
  @ZodResponse({ status: 200, type: [UserResponseDto] })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.userService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar usuário por ID',
    description: 'Retorna os dados de um usuário específico pelo seu UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do usuário',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.userService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar usuário',
    description: 'Atualiza parcialmente os dados de um usuário existente. Todos os campos são opcionais.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do usuário',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Dados de entrada inválidos',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserDto)) updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.update(id, updateUserDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover usuário',
    description: 'Remove permanentemente um usuário do sistema.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do usuário',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuário removido com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.userService.remove(id, user);
  }

  @Patch(':id/points')
  @ApiOperation({
    summary: 'Vincular pontos ao usuário',
    description: 'Vincula um ou mais pontos a um usuário do tipo "user". Apenas admins ou supervisores podem realizar esta operação.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do usuário',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiBody({
    type: LinkPointsDto,
    description: 'Lista de IDs dos pontos a serem vinculados',
    examples: {
      vincularPontos: {
        summary: 'Vincular dois pontos ao usuário',
        value: {
          pointIds: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b', 'e4f3b2a1-5d6e-4f7a-9b8c-0d1e2f3a4b5c'],
        },
      },
    },
  })
  @ZodResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Dados de entrada inválidos',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuário sem permissão para realizar esta operação',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário ou pontos não encontrados',
  })
  linkPoints(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LinkPointsDto)) linkPointsDto: LinkPointsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.linkPoints(id, linkPointsDto, user);
  }

  @Delete(':id/points')
  @ApiOperation({
    summary: 'Remover vinculação de pontos',
    description: 'Remove a vinculação de um ou mais pontos de um usuário. Apenas admins ou supervisores podem realizar esta operação.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do usuário',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiBody({
    type: LinkPointsDto,
    description: 'Lista de IDs dos pontos a serem desvinculados',
    examples: {
      desvincularPontos: {
        summary: 'Desvincular dois pontos do usuário',
        value: {
          pointIds: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b', 'e4f3b2a1-5d6e-4f7a-9b8c-0d1e2f3a4b5c'],
        },
      },
    },
  })
  @ZodResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Dados de entrada inválidos',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuário sem permissão para realizar esta operação',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  unlinkPoints(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LinkPointsDto)) linkPointsDto: LinkPointsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.unlinkPoints(id, linkPointsDto, user);
  }

  @Get(':id/points')
  @ApiOperation({
    summary: 'Listar pontos vinculados ao usuário',
    description: 'Retorna todos os pontos vinculados a um usuário específico.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do usuário',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: [PointResponseDto] })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  getUserPoints(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.getUserPoints(id, user);
  }
}
