import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { PointService } from './point.service.js';
import { CreatePointDto } from './dto/create-point.schema.js';
import { UpdatePointDto } from './dto/update-point.schema.js';
import { PointResponseDto } from './dto/point-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Points')
@ApiBearerAuth()
@Controller('point')
export class PointController {
  constructor(private readonly pointService: PointService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar ponto de entrada/saída',
    description:
      'Cria um novo ponto (portão, cancelheira, etc.) vinculado a uma unidade administrativa da empresa.\n\n' +
      '**O que é um ponto?**\n' +
      'Um ponto representa um local físico onde câmeras ANPR são instaladas para detectar veículos. ' +
      'Cada ponto pode ter um ou mais câmeras vinculadas. O tipo define se o ponto é de entrada, saída ou ambos.\n\n' +
      '**Configuração ANPR por ponto:**\n' +
      'Ao criar um ponto, você pode configurar parâmetros ANPR específicos para ele. ' +
      'Se um campo for omitido ou definido como `null`, o ponto herda o valor da configuração da empresa.\n\n' +
      '**Campos de configuração ANPR disponíveis:**\n' +
      '- `anprAutoRegister`: Ativa/desativa o registro automático de movimentação neste ponto\n' +
      '- `anprSaveUnrecognizedPhotos`: Salva foto quando placa não é reconhecida\n' +
      '- `anprAutoRegisterCooldownSeconds`: Intervalo mínimo entre registros do mesmo veículo\n' +
      '- `anprConfidenceThreshold`: Confiança mínima para aceitar leitura (0 a 1)\n' +
      '- `anprMatchTimeoutSeconds`: Timeout para confirmar leitura de placa\n' +
      '- `anprConfirmationReads`: Número de leituras consecutivas para confirmar\n' +
      '- `anprStaleAfterSeconds`: Tempo para considerar observação expirada\n\n' +
      '**Exemplo — Criar ponto com config ANPR customizada:**\n' +
      '```json\n' +
      '{\n' +
      '  "name": "Portão Principal",\n' +
      '  "code": "P-001",\n' +
      '  "type": "both",\n' +
      '  "adminUnityId": "d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b",\n' +
      '  "anprAutoRegister": true,\n' +
      '  "anprAutoRegisterCooldownSeconds": 60,\n' +
      '  "anprConfidenceThreshold": 0.90\n' +
      '}\n' +
      '```\n\n' +
      '**Exemplo — Criar ponto herdando tudo da empresa:**\n' +
      '```json\n' +
      '{\n' +
      '  "name": "Portão Dos Fundos",\n' +
      '  "code": "P-002",\n' +
      '  "type": "exit",\n' +
      '  "adminUnityId": "d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b"\n' +
      '}\n' +
      '```',
  })
  @ZodResponse({ status: 201, type: PointResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos (nome, código ou UUID da unidade ausentes/inválidos)' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão de admin na empresa' })
  @ApiResponse({ status: 409, description: 'Já existe um ponto com o mesmo código (code) na empresa' })
  create(
    @Body(new ZodValidationPipe(CreatePointDto)) createPointDto: CreatePointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pointService.create(createPointDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar pontos da empresa',
    description:
      'Retorna todos os pontos (portões) vinculados à empresa do usuário autenticado.\n\n' +
      '**Uso no frontend:**\n' +
      'Este endpoint é útil para popular dropdowns, listagens e telas de configuração. ' +
      'Cada ponto retornado inclui os campos de configuração ANPR (que podem ser `null` ' +
      'indicando que herdam o valor da empresa).\n\n' +
      '**Campos retornados por ponto:**\n' +
      '- `id`: UUID do ponto (usar para vincular câmeras e configurar)\n' +
      '- `name`: Nome de exibição (ex: "Portão Principal")\n' +
      '- `code`: Código único do ponto (ex: "P-001")\n' +
      '- `type`: `entry`, `exit` ou `both`\n' +
      '- `adminUnityId`: UUID da unidade administrativa vinculada\n' +
      '- `active`: Se o ponto está ativo\n' +
      '- `anprAutoRegister`: Registro automático habilitado? (null = usa empresa)\n' +
      '- `anprConfidenceThreshold`: Confiança mínima ANPR (null = usa empresa)\n' +
      '- `anprAutoRegisterCooldownSeconds`: Cooldown entre registros (null = usa empresa)\n' +
      '- ... e demais campos de configuração ANPR\n\n' +
      '**Exemplo de uso no frontend:**\n' +
      '```javascript\n' +
      'const points = await fetch("/point", {\n' +
      '  headers: { Authorization: `Bearer ${token}` }\n' +
      '}).then(r => r.json());\n' +
      '\n' +
      '// Montar select/dropdown\n' +
      'points.forEach(p => {\n' +
      '  const label = `${p.name} (${p.code})`;\n' +
      '  const autoReg = p.anprAutoRegister ?? "herda empresa";\n' +
      '  // ...\n' +
      '});\n' +
      '```\n\n' +
      '**Ordenação:** Retornado por data de criação (mais antigo primeiro).',
  })
  @ZodResponse({ status: 200, type: [PointResponseDto] })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.pointService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar ponto por ID',
    description:
      'Retorna os dados completos de um ponto específico, incluindo todas as configurações ANPR.\n\n' +
      '**Uso no frontend:**\n' +
      'Use este endpoint para carregar os dados de um ponto ao abrir tela de edição ou detalhes. ' +
      'Os campos `anpr*` retornam o valor configurado para o ponto (ou `null` se herda da empresa).\n\n' +
      '**Exemplo de uso no frontend:**\n' +
      '```javascript\n' +
      'const point = await fetch(`/point/${pointId}`, {\n' +
      '  headers: { Authorization: `Bearer ${token}` }\n' +
      '}).then(r => r.json());\n' +
      '\n' +
      '// Exibir config ANPR (indicando se herda da empresa)\n' +
      'const config = {\n' +
      '  autoRegister: point.anprAutoRegister ?? companyConfig.anprAutoRegister,\n' +
      '  cooldown: point.anprAutoRegisterCooldownSeconds ?? companyConfig.anprAutoRegisterCooldownSeconds,\n' +
      '  confidence: point.anprConfidenceThreshold ?? companyConfig.anprConfidenceThreshold,\n' +
      '};\n' +
      '```',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do ponto',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: PointResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 404, description: 'Ponto não encontrado ou não pertence à empresa do usuário' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pointService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar ponto (parcial)',
    description:
      'Atualiza parcialmente os dados de um ponto existente. Apenas os campos enviados são alterados.\n\n' +
      '**Campo fixo (não alterável):**\n' +
      '- `adminUnityId`: Unidade administrativa vinculada ao ponto\n' +
      'Se precisar alterar a unidade administrativa, crie um novo ponto.\n\n' +
      '**Configuração ANPR por ponto:**\n' +
      'Use este endpoint para personalizar os parâmetros ANPR de um ponto específico. ' +
      'Envie apenas os campos que deseja sobrescrever. Para reverter para o padrão da empresa, ' +
      'defina o campo como `null`.\n\n' +
      '**Comportamento de herança:**\n' +
      '- Campo `null` → usa o valor da configuração da empresa\n' +
      '- Campo com valor → sobrescreve o da empresa para este ponto\n\n' +
      '**Exemplo — Ativar auto-registration apenas neste ponto:**\n' +
      '```json\n' +
      '{ "anprAutoRegister": true }\n' +
      '```\n\n' +
      '**Exemplo — Customizar cooldown e confiança:**\n' +
      '```json\n' +
      '{\n' +
      '  "anprAutoRegisterCooldownSeconds": 120,\n' +
      '  "anprConfidenceThreshold": 0.95\n' +
      '}\n' +
      '```\n\n' +
      '**Exemplo — Reverter campo para o padrão da empresa:**\n' +
      '```json\n' +
      '{ "anprAutoRegisterCooldownSeconds": null }\n' +
      '```\n\n' +
      '**Exemplo — Desativar auto-registration neste ponto:**\n' +
      '```json\n' +
      '{ "anprAutoRegister": false }\n' +
      '```\n\n' +
      '**Exemplo — Atualizar dados básicos:**\n' +
      '```json\n' +
      '{ "name": "Portão Principal - Reformado" }\n' +
      '```',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do ponto a ser atualizado',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: PointResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos ou tentativa de alterar campo fixo (adminUnityId)' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão de admin na empresa' })
  @ApiResponse({ status: 404, description: 'Ponto não encontrado ou não pertence à empresa do usuário' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePointDto)) updatePointDto: UpdatePointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pointService.update(id, updatePointDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover ponto',
    description:
      'Remove permanentemente um ponto do sistema.\n\n' +
      '**Atenção:**\n' +
      '- Não é possível remover um ponto que tenha câmeras vinculadas\n' +
      '- Não é possível remover um ponto que tenha movimentações registradas\n' +
      '- A remoção é irreversível\n\n' +
      '**Uso no frontend:**\n' +
      'Antes de chamar este endpoint, o front deve confirmar a ação com o usuário. ' +
      'Recomenda-se exibir um diálogo de confirmação antes de executar.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do ponto a ser removido',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiResponse({ status: 200, description: 'Ponto removido com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão de admin na empresa' })
  @ApiResponse({ status: 404, description: 'Ponto não encontrado ou não pertence à empresa do usuário' })
  @ApiResponse({ status: 409, description: 'Ponto possui câmeras ou movimentações vinculadas' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pointService.remove(id, user);
  }
}
