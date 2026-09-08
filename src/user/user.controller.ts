import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { UserService } from './user.service.js';
import { CreateUserDto } from './dto/create-user.schema.js';
import { UpdateUserDto } from './dto/update-user.schema.js';
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
  @ZodResponse({ status: 201, type: CreateUserDto })
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
  @ZodResponse({ status: 200, type: [CreateUserDto] })
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
  @ZodResponse({ status: 200, type: CreateUserDto })
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
  @ZodResponse({ status: 200, type: CreateUserDto })
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
}
