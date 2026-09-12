import { Controller, Get, Post, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { AutoRegistrationService } from './auto-registration.service.js';
import { MovementService } from '../movement/movement.service.js';
import { RecalculateMovementDto } from './dto/recalculate-movement.schema.js';
import { PendingReviewMovementDto } from './dto/pending-review-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

/**
 * ## Auto Registration — Registro Automático de Movimentação por ANPR
 *
 * Este controller gerencia os movimentos criados **automaticamente** pelo sistema
 * quando uma câmera ANPR detecta e confirma a leitura de uma placa.
 *
 * ### Fluxo completo (para o frontend):
 *
 * #### 1. Configuração (ativação)
 * O sistema só funciona se a empresa tiver `anprAutoRegister: true` na config.
 * Para ativar: `PATCH /company-config/:companyId` com `{ "anprAutoRegister": true }`
 *
 * #### 2. Monitoramento automático (backend, sem frontend)
 * O worker roda em background a cada ~3s:
 * - Verifica todas as câmeras ativas via microserviço Python ANPR
 * - Quando uma placa é confirmada (2+ leituras consecutivas), cria o movimento
 * - Se a placa existe no DB → movimento com status `open` (completo)
 * - Se a placa NÃO existe → movimento com status `pending_review` (incompleto)
 *
 * #### 3. Visualização de pendentes (front)
 * `GET /movement/pending-review` retorna todos os movimentos `pending_review`
 * O front deve exibir: placa reconhecida, data/hora, foto (se disponível), botão de ação
 *
 * #### 4. Correção / Cadastro (front)
 * Duas opções para o usuário:
 * - **Opção A (placa errada):** Se o veículo já existe com outra placa, corrija o veículo
 *   via `PATCH /vehicle/:id` com a placa correta
 * - **Opção B (veículo novo):** Cadastre o veículo via `POST /vehicle`
 *
 * #### 5. Recálculo (front)
 * Após corrigir ou cadastrar: `POST /movement/:id/recalculate`
 * - Com `{ "plate": "ABC1D24" }` → busca veículo pela placa corrigida
 * - Com `{ "vehicleId": "uuid" }` → usa o veículo já cadastrado
 * - Resultado: movimento muda para `open` com vehicleId preenchido
 *
 * ### Resumo dos endpoints
 * | Método | Rota | Descrição |
 * |--------|------|-----------|
 * | `GET` | `/movement/pending-review` | Listar movimentos pendentes de revisão |
 * | `POST` | `/movement/:id/recalculate` | Recalcular movimento após correção |
 */
@ApiTags('Auto Registration')
@ApiBearerAuth()
@Controller('movement')
export class AutoRegistrationController {
  constructor(
    private readonly autoRegistration: AutoRegistrationService,
    private readonly movementService: MovementService,
  ) {}

  /**
   * ### GET /movement/pending-review
   *
   * Retorna todos os movimentos com status `pending_review` — ou seja,
   * movimentos onde o ANPR leu uma placa que **não foi encontrada** na base de dados de veículos.
   *
   * **Quando usar:** Para exibir ao operador/porteiro a lista de veículos não reconhecidos
   * que precisam de intervenção manual (corrigir placa ou cadastrar veículo).
   *
   * **O que retorna:**
   * - `id`: UUID do movimento (usar no recálculo)
   * - `recognizedPlate`: Placa que o OCR leu (pode ter erros de leitura)
   * - `photoPath`: Caminho da foto de evidência (se `anprSaveUnrecognizedPhotos` está ativo)
   *   - A foto pode ser acessada via `GET /anpr/monitors/:cameraId/observations/:observationId/image`
   *   - Ou servida pelo backend se o path for local
   * - `dateTime`: Data/hora em que o veículo passou na câmera
   * - `type`: Entrada (`entry`) ou saída (`exit`)
   * - `pointId`: ID do ponto (portão) onde está a câmera
   * - `observationId`: ID da observação ANPR (para referência)
   *
   * **Comportamento:**
   * - Retorna array vazio `[]` se não houver pendências
   * - Ordenado por data/hora decrescente (mais recente primeiro)
   * - Apenas movimentos da empresa do usuário autenticado
   *
   * **Exemplo de uso no frontend:**
   * ```javascript
   * const pending = await fetch('/movement/pending-review', {
   *   headers: { Authorization: `Bearer ${token}` }
   * });
   * const movements = await pending.json();
   *
   * // Exibir cada movimento com:
   * // - Placa reconhecida (recognizedPlate)
   * // - Foto (photoPath ou URL de evidência)
   * // - Botão "Corrigir Placa" → abre modal para editar
   * // - Botão "Cadastrar Veículo" → abre formulário de cadastro
   * // - Botão "Recalcular" → chama POST /movement/:id/recalculate
   * ```
   */
  @Get('pending-review')
  @ApiOperation({
    summary: 'Listar movimentos pendentes de revisão',
    description:
      'Retorna movimentos criados automaticamente onde a placa não foi encontrada na base de dados.\n\n' +
      '**Fluxo de uso pelo frontend:**\n' +
      '1. Sistema ANPR detecta placa não cadastrada → movimento `pending_review` é criado automaticamente\n' +
      '2. Front chama `GET /movement/pending-review` periodicamente ou ao acessar a tela de monitoramento\n' +
      '3. Exibe a lista para o operador com: placa reconhecida, foto, data/hora, tipo (entrada/saída)\n' +
      '4. Operador corrige a placa ou cadastra o veículo\n' +
      '5. Front chama `POST /movement/:id/recalculate` com a placa correta ou vehicleId\n\n' +
      '**Retorno:** Array de movimentos pendentes (pode ser vazio `[]`)\n\n' +
      '**Cada item do array contém:**\n' +
      '- `id`: UUID do movimento (usar no endpoint de recálculo)\n' +
      '- `recognizedPlate`: Placa que o OCR leu (pode conter erros de leitura)\n' +
      '- `photoPath`: Caminho local da foto de evidência (null se não salva)\n' +
      '- `dateTime`: Data/hora ISO 8601 em que o veículo passou na câmera\n' +
      '- `type`: `entry` (entrada) ou `exit` (saída)\n' +
      '- `pointId`: UUID do ponto/portão da câmera\n' +
      '- `observationId`: UUID da observação ANPR (para buscar evidência via Python)\n\n' +
      '**Para acessar a foto de evidência:**\n' +
      'Use `GET /anpr/monitors/:cameraId/observations/:observationId/image` (proxy do Python)\n' +
      'O `cameraId` pode ser obtido consultando a câmera vinculada ao `pointId`.',
  })
  @ZodResponse({ status: 200, type: [PendingReviewMovementDto] })
  @ApiResponse({
    status: 401,
    description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login',
  })
  async findPendingReview(@CurrentUser() user: AuthenticatedUser) {
    const movements = await this.movementService.findPendingReview(user);
    const result = await Promise.all(
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
    return result;
  }

  /**
   * ### POST /movement/:id/recalculate
   *
   * Recalcula um movimento pendente de revisão após o usuário corrigir a placa
   * ou cadastrar o veículo na base de dados.
   *
   * **Antes de chamar este endpoint, o frontend deve garantir que:**
   * 1. Se a placa foi corrigida → o veículo com a placa correta já existe no DB
  *    (cadastrar via `POST /vehicle` se necessário)
   * 2. Se o veículo é novo → já foi cadastrado via `POST /vehicle`
   *
   * **Duas formas de uso:**
   *
   * #### Opção 1: Correção de placa (veículo já existe)
   * ```json
   * { "plate": "ABC1D24" }
   * ```
   * O backend busca o veículo pela placa informada. Se não encontrar, retorna 404.
   *
   * #### Opção 2: Veículo já cadastrado
   * ```json
   * { "vehicleId": "d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b" }
   * ```
   * O backend usa o veículo diretamente pelo ID.
   *
   * **Resultado do recálculo:**
   * - `vehicleId` do movimento é preenchido com o veículo encontrado
   * - `status` muda de `pending_review` para `open`
   * - `recognizedPlate` é limpo (nulado) — os dados completos ficam no vehicle
   * - `recalculatedAt` registra a data/hora do recálculo
   *
   * **Erros comuns:**
   * - `404`: Movimento não existe OU veículo com essa placa não está cadastrado
   * - `409`: Movimento não está com status `pending_review` (já foi processado)
   * - `400`: Nenhum dos campos `plate` ou `vehicleId` foi informado
   */
  @Post(':id/recalculate')
  @ApiOperation({
    summary: 'Recalcular movimento pendente de revisão',
    description:
      'Reprocessa um movimento com status `pending_review` após correção da placa ou cadastro do veículo.\n\n' +
      '**Fluxo de uso pelo frontend:**\n' +
      '1. Usuário visualiza movimento pendente via `GET /movement/pending-review`\n' +
      '2. Usuário identifica placa errada ou veículo não cadastrado\n' +
      '3. Se necessário, cadastra o veículo: `POST /vehicle` com os dados corretos\n' +
      '4. Front envia `POST /movement/:id/recalculate` com placa corrigida ou vehicleId\n' +
      '5. Backend busca veículo, atualiza movimento para status `open`\n' +
      '6. Movimento agora aparece na listagem normal de movimentos\n\n' +
      '**Payload — Opção A (correção de placa):**\n' +
      '```json\n' +
      '{ "plate": "ABC1D24" }\n' +
      '```\n' +
      'O backend busca veículo pela placa. Retorna 404 se não encontrar.\n\n' +
      '**Payload — Opção B (vehicleId já conhecido):**\n' +
      '```json\n' +
      '{ "vehicleId": "d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b" }\n' +
      '```\n' +
      'O backend usa o veículo diretamente.\n\n' +
      '**Antes de chamar, garantir:**\n' +
      '- O veículo com a placa correta já existe no DB (cadastrar via `POST /vehicle`)\n' +
      '- Ou o `vehicleId` informado é de um veículo ativo\n\n' +
      '**Resposta de sucesso:** Retorna o movimento atualizado com `status: "open"` e `vehicleId` preenchido.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do movimento pendente de revisão (obtido de GET /movement/pending-review)',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados de entrada inválidos. Nenhum dos campos plate ou vehicleId foi informado.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login.',
  })
  @ApiResponse({
    status: 404,
    description: 'Movimento não encontrado OU veículo com a placa informada não está cadastrado no DB.',
  })
  @ApiResponse({
    status: 409,
    description: 'Movimento não está com status pending_review. Já foi processado anteriormente.',
  })
  recalculate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RecalculateMovementDto)) dto: RecalculateMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementService.recalculate(id, dto, user);
  }
}
