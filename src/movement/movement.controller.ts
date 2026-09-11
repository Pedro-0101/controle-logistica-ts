import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { MovementService } from './movement.service.js';
import { CreateMovementDto } from './dto/create-movement.schema.js';
import { CreateMovementFromCameraDto } from './dto/create-movement-from-camera.schema.js';
import { CreateMovementFromObservationDto } from './dto/create-movement-from-observation.schema.js';
import { UpdateMovementDto } from './dto/update-movement.schema.js';
import { MovementResponseDto } from './dto/movement-response.schema.js';
import { MovementFromCameraResponseDto } from './dto/movement-from-camera-response.schema.js';
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
    summary: 'Criar movimento a partir da câmera (atalho legado)',
    description:
      'Busca a observação atual da câmera e registra o movimento em uma única chamada.\n\n' +
      '**Recomendação:** Prefira usar `GET /camera/:id/current-observation` + `POST /movement/from-observation` ' +
      'para ter controle visual do que está sendo confirmado pelo porteiro.\n\n' +
      'Equivalente a chamar `current-observation` + `from-observation` internamente.\n\n' +
      'O front envia apenas o `cameraId` (e dados operacionais opcionais) — nada sobre o veículo. ' +
      'O backend resolve o tipo do movimento (entrada/saída) a partir do ponto vinculado à câmera, ' +
      'busca/cria o veículo pela placa reconhecida e retorna o movimento com os dados do veículo.',
  })
  @ZodResponse({ status: 201, type: MovementFromCameraResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Câmera ou ponto não encontrado' })
  @ApiResponse({ status: 422, description: 'Placa não reconhecida na imagem' })
  @ApiResponse({ status: 502, description: 'Falha ao capturar imagem da câmera' })
  createFromCamera(
    @Body(new ZodValidationPipe(CreateMovementFromCameraDto))
    createMovementFromCameraDto: CreateMovementFromCameraDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementService.createFromCamera(createMovementFromCameraDto, user);
  }

  @Post('from-observation')
  @ApiOperation({
    summary: 'Confirmar observação e registrar movimento',
    description:
      'Confirma a leitura de placa de uma câmera e registra a entrada/saída do veículo.\n\n' +
      '**Fluxo de uso:**\n' +
      '1. Front consulta `GET /camera/:id/current-observation` e obtém o `observationId` quando status = `"confirmed"`\n' +
      '2. Porteiro confirma o atendimento (ex: abre cancela)\n' +
      '3. Front envia este endpoint com o `observationId`\n' +
      '4. Backend valida se a observação ainda está fresca e consistente com o estado atual da câmera\n' +
      '5. Busca ou cria o veículo pela placa reconhecida\n' +
      '6. Registra o movimento (entrada/saída) vinculado ao ponto da câmera\n\n' +
      '**Idempotência:**\n' +
      'Duas confirmações da mesma observação retornam o mesmo movimento (protegido por lock pessimista no banco). ' +
      'Isso permite retry seguro caso a resposta HTTP original tenha sido perdida.\n\n' +
      '**Validações:**\n' +
      '- A observação deve estar com status `"confirmed"` e não expirada\n' +
      '- O `observationId` deve corresponder à observação atual da câmera no Python\n' +
      '- A câmera, ponto e unidade devem estar ativos e vinculados à empresa do usuário\n' +
      '- O tipo do movimento (entry/exit) é resolvido automaticamente pelo ponto da câmera\n\n' +
      '**Erros comuns:**\n' +
      '- 409: Observação expirou (o veículo saiu da câmera) → consultar nova observação\n' +
      '- 404: Observação não encontrada ou não pertence à empresa\n' +
      '- 400: Ponto inativo ou tipo incompatível',
  })
  @ZodResponse({ status: 201, type: MovementFromCameraResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos, ponto inativo ou tipo incompatível' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Observação não encontrada ou não pertence à empresa do usuário' })
  @ApiResponse({ status: 409, description: 'Observação expirada, substituída por outra ou indisponível no Python' })
  @ApiResponse({ status: 422, description: 'Veículo inativo' })
  createFromObservation(
    @Body(new ZodValidationPipe(CreateMovementFromObservationDto)) dto: CreateMovementFromObservationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) { return this.movementService.createFromObservation(dto, actor); }

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
