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

  @Post('discard')
  @ApiOperation({
    summary: 'Descartar movimentos pendentes em lote',
    description:
      'Marca como `discarded` uma lista de movimentos com status `pending_review`.\n\n' +
      '**Uso no frontend:**\n' +
      '1. Operador visualiza os pendentes via `GET /movement/pending-review`\n' +
      '2. Seleciona um ou vários movimentos (ex.: leituras incorretas do OCR)\n' +
      '3. Front envia `POST /movement/discard` com a lista de `ids` selecionados\n\n' +
      '**Importante:** o descarte é individual — apenas os IDs informados são ' +
      'alterados. Outros movimentos pendentes com a mesma placa **não** são afetados.\n\n' +
      '**Resposta:** lista dos movimentos atualizados com `status: "discarded"`.\n\n' +
      '**Erros comuns:**\n' +
      '- `404`: algum dos IDs informados não existe ou não pertence à empresa do usuário\n' +
      '- `409`: algum dos movimentos não está com status `pending_review`',
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
    description:
      'Reprocessa o pareamento de entrada/saída de um período e recalcula o status dos movimentos confirmados.\n\n' +
      '**Quando usar:** após descartar ou ajustar movimentos, para reavaliar quais visitas devem ficar `closed`.\n\n' +
      '**Como funciona:**\n' +
      '1. Carrega os movimentos `open`/`closed` (com veículo) do período\n' +
      '2. Agrupa por veículo + unidade administrativa e ordena por data\n' +
      '3. Uma saída fecha a entrada mais recente ainda em aberto (o par fica `closed`)\n' +
      '4. Entradas que ficaram sem saída voltam para `open`\n' +
      '5. Saídas sem entrada correspondente **não** têm o status alterado\n\n' +
      '`pending_review` e `discarded` não participam do pareamento.\n\n' +
      '**Limite:** período máximo de 31 dias. Empresa é inferida do usuário; admin global deve informar `companyId`.',
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
    description:
      'Retorna uma lista paginada de movimentos com dados do ponto, veículo e câmera vinculados.\n\n' +
      '**Filtros disponíveis:** tipo, status, ponto, veículo, placa, motorista, motivo, auto-registrado, período.\n' +
      '**Busca livre:** campo `search` pesquisa por placa, motorista, motivo e notas.',
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
    description:
      'Retorna movimentos criados automaticamente onde a placa não foi encontrada na base de dados.\n\n' +
      '**Cada item do array contém:**\n' +
      '- `id`: UUID do movimento (usar no endpoint de recálculo)\n' +
      '- `recognizedPlate`: Placa que o OCR leu (pode conter erros de leitura)\n' +
      '- `photoPath`: Chave da foto de evidência no storage (null se não salva). ' +
      'Para exibir, use `GET /movement/:id/evidence`\n' +
      '- `dateTime`: Data/hora ISO 8601 em que o veículo passou na câmera\n' +
      '- `type`: `entry` (entrada) ou `exit` (saída)\n' +
      '- `pointId`: UUID do ponto/portão da câmera\n' +
      '- `observationId`: UUID da observação ANPR vinculada\n\n' +
      '**Foto de evidência:** para exibir a imagem ao operador, use `GET /movement/:id/evidence` ' +
      '(o `photoPath` é apenas a chave interna no storage).\n\n' +
      '**Importante:** esta rota é estática e precisa ser declarada antes de `GET /movement/:id` ' +
      'para não ser capturada pelo parâmetro dinâmico.',
  })
  @ZodResponse({ status: 200, type: [PendingReviewMovementDto] })
  @ApiResponse({
    status: 401,
    description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login',
  })
  async findPendingReview(@CurrentUser() user: AuthenticatedUser) {
    const movements = await this.movementService.findPendingReview(user);
    return Promise.all(
      movements.map(async (m) => {
        let photoPath: string | null = null;
        if (m.observationId) {
          const obs = await this.movementService.findObservationPhotoPath(m.observationId);
          photoPath = obs?.photoPath ?? null;
        }
        return {
          id: m.id,
          observationId: m.observationId,
          pointId: m.pointId,
          vehicleId: m.vehicleId,
          recognizedPlate: m.recognizedPlate,
          type: m.type,
          dateTime: m.dateTime.toISOString(),
          status: m.status,
          companyId: m.companyId,
          autoRegistered: m.autoRegistered,
          photoPath,
          createdAt: m.createdAt.toISOString(),
        };
      }),
    );
  }

  @Get(':id/evidence')
  @ApiOperation({
    summary: 'Buscar foto de evidência do movimento',
    description:
      'Retorna a foto de evidência (JPEG) de um movimento a partir do seu ID.\n\n' +
      '**Quando usar:** movimentos automáticos (`pending_review` ou `open`) cuja placa foi lida por ANPR. ' +
      'A imagem só existe quando `anprSaveUnrecognizedPhotos=true` na config da empresa/ponto e a placa não foi encontrada no cadastro de veículos.\n\n' +
      '**Resolução:** o backend localiza a observação vinculada ao movimento e busca o arquivo no storage ' +
      '(MinIO ou disco local).\n\n' +
      '**Uso no frontend:** como a rota exige o token JWT no header `Authorization`, faça o download via `fetch` ' +
      'e monte um `blob:` URL para exibir no `<img>`:\n' +
      '```js\n' +
      "const res = await fetch(`/movement/${id}/evidence`, { headers: { Authorization: `Bearer ${token}` } });\n" +
      "const url = URL.createObjectURL(await res.blob());\n" +
      '```\n\n' +
      '**Erros comuns:**\n' +
      '- `404`: movimento inexistente/fora da empresa, sem observação vinculada, sem foto salva ou objeto ausente no storage',
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
