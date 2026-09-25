import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiProduces,
} from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse, ZodQuery } from 'zod-nest';
import { MovementService } from './movement.service.js';
import { CreateMovementDto } from './dto/create-movement.schema.js';
import { CreateMovementFromCameraDto } from './dto/create-movement-from-camera.schema.js';
import { CreateMovementFromObservationDto } from './dto/create-movement-from-observation.schema.js';
import { UpdateMovementDto } from './dto/update-movement.schema.js';
import { MovementResponseDto } from './dto/movement-response.schema.js';
import { MovementFromCameraResponseDto } from './dto/movement-from-camera-response.schema.js';
import { FindMovementsDto } from './dto/find-movements.schema.js';
import { DiscardMovementsDto } from './dto/discard-movements.schema.js';
import { ReconcileMovementsDto } from './dto/reconcile-movements.schema.js';
import { ReconcileMovementsResponseDto } from './dto/reconcile-movements-response.schema.js';
import { PaginatedMovementsResponseDto } from './dto/movement-list-response.schema.js';
import { PendingReviewMovementDto } from '../auto-registration/dto/pending-review-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { MOVEMENT_DOCS } from './movement.docs.js';

@ApiTags('Movements')
@ApiBearerAuth()
@Controller('movement')
export class MovementController {
  constructor(private readonly movementService: MovementService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar movimento',
    description: MOVEMENT_DOCS.create,
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
    description: MOVEMENT_DOCS.createFromCamera,
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
    description: MOVEMENT_DOCS.createFromObservation,
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

  @Post('discard')
  @ApiOperation({
    summary: 'Descartar movimentos pendentes em lote',
    description: MOVEMENT_DOCS.discard,
  })
  @ZodResponse({ status: 201, type: [MovementResponseDto] })
  @ApiResponse({ status: 400, description: 'Lista de ids vazia ou com UUID inválido' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Um ou mais movimentos não foram encontrados' })
  @ApiResponse({
    status: 409,
    description: 'Um ou mais movimentos não estão com status pending_review',
  })
  discard(
    @Body(new ZodValidationPipe(DiscardMovementsDto)) dto: DiscardMovementsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementService.discard(dto.ids, user);
  }

  @Post('reconcile')
  @ApiOperation({
    summary: 'Recalcular fechamento de movimentos por período',
    description: MOVEMENT_DOCS.reconcile,
  })
  @ZodResponse({ status: 201, type: ReconcileMovementsResponseDto })
  @ApiResponse({ status: 400, description: 'Período inválido ou maior que 31 dias' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Admin global sem companyId informado' })
  reconcile(
    @Body(new ZodValidationPipe(ReconcileMovementsDto)) dto: ReconcileMovementsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementService.reconcile(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar movimentos (paginado com filtros)',
    description: MOVEMENT_DOCS.findAll,
  })
  @ZodQuery(FindMovementsDto.schema)
  @ZodResponse({ status: 200, type: PaginatedMovementsResponseDto })
  findAll(
    @Query(new ZodValidationPipe(FindMovementsDto)) filters: FindMovementsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementService.findAll(user, filters);
  }

  @Get('pending-review')
  @ApiOperation({
    summary: 'Listar movimentos pendentes de revisão',
    description: MOVEMENT_DOCS.findPendingReview,
  })
  @ZodResponse({ status: 200, type: [PendingReviewMovementDto] })
  @ApiResponse({
    status: 401,
    description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login',
  })
  findPendingReview(@CurrentUser() user: AuthenticatedUser) {
    return this.movementService.findPendingReviewDetailed(user);
  }

  @Get(':id/evidence')
  @ApiOperation({
    summary: 'Buscar foto de evidência do movimento',
    description: MOVEMENT_DOCS.evidence,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do movimento',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiProduces('image/jpeg')
  @ApiResponse({
    status: 200,
    description: 'Imagem JPEG da evidência',
    content: { 'image/jpeg': {} },
  })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Movimento ou foto de evidência não encontrados' })
  async evidence(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    const { buffer, contentType } = await this.movementService.getEvidence(id, user);
    return new StreamableFile(buffer, { type: contentType, length: buffer.length });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar movimento por ID',
    description: MOVEMENT_DOCS.findOne,
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
    description: MOVEMENT_DOCS.update,
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
    description: MOVEMENT_DOCS.remove,
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
