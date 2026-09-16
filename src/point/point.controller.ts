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
      'O campo `inheritCompanyConfig` controla a herança de configurações:\n' +
      '- `true` (default): O ponto herda TODAS as configurações ANPR da empresa\n' +
      '- `false`: O ponto usa seus próprios valores dos campos ANPR abaixo\n\n' +
      '**Campos de configuração ANPR (usados quando inheritCompanyConfig = false):**\n' +
      '- `anprAutoRegister`: Ativa/desativa o registro automático de viagens neste ponto\n' +
      '- `anprSaveUnrecognizedPhotos`: Salva foto quando placa não é reconhecida\n' +
      '- `anprAutoRegisterCooldownSeconds`: Intervalo mínimo entre registros do mesmo veículo\n' +
      '- `anprConfidenceThreshold`: Confiança mínima para aceitar leitura (0 a 1)\n' +
      '- `anprMatchTimeoutSeconds`: Timeout para confirmar leitura de placa\n' +
      '- `anprConfirmationReads`: Número de leituras consecutivas para confirmar\n' +
      '- `anprStaleAfterSeconds`: Tempo para considerar observação expirada\n' +
      '- `anprRecognitionMode`: `local` | `verified` | `external` (modo de reconhecimento neste ponto)\n' +
      '- `anprExternalProvider`: Provider externo (`google_vision`)\n' +
      '- `anprExternalMinConfidence`: Confiança mínima para aceitar a placa da API externa (0 a 1)\n' +
      '- `anprExternalTimeoutMs`: Timeout em milissegundos da API externa\n' +
      '- `anprExternalFallbackToLocal`: Usar leitura local quando a API externa falhar\n\n' +
      '**Exemplo — Criar ponto herdando config da empresa (default):**\n' +
      '```json\n' +
      '{\n' +
      '  "name": "Portão Dos Fundos",\n' +
      '  "code": "P-002",\n' +
      '  "type": "exit",\n' +
      '  "adminUnityId": "d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b"\n' +
      '}\n' +
      '```\n\n' +
      '**Exemplo — Criar ponto com config ANPR customizada:**\n' +
      '```json\n' +
      '{\n' +
      '  "name": "Portão Principal",\n' +
      '  "code": "P-001",\n' +
      '  "type": "both",\n' +
      '  "adminUnityId": "d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b",\n' +
      '  "inheritCompanyConfig": false,\n' +
      '  "anprAutoRegister": true,\n' +
      '  "anprAutoRegisterCooldownSeconds": 60,\n' +
      '  "anprConfidenceThreshold": 0.90\n' +
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
      'Cada ponto retornado inclui o campo `inheritCompanyConfig` e os campos de configuração ANPR.\n\n' +
      '**Campos retornados por ponto:**\n' +
      '- `id`: UUID do ponto (usar para vincular câmeras e configurar)\n' +
      '- `name`: Nome de exibição (ex: "Portão Principal")\n' +
      '- `code`: Código único do ponto (ex: "P-001")\n' +
      '- `type`: `entry`, `exit` ou `both`\n' +
      '- `adminUnityId`: UUID da unidade administrativa vinculada\n' +
      '- `active`: Se o ponto está ativo\n' +
      '- `inheritCompanyConfig`: Se `true`, herda config ANPR da empresa\n' +
      '- `anprAutoRegister`: Registro automático habilitado? (null quando herda)\n' +
      '- `anprConfidenceThreshold`: Confiança mínima ANPR (null quando herda)\n' +
      '- `anprAutoRegisterCooldownSeconds`: Cooldown entre registros (null quando herda)\n' +
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
      '  const configSource = p.inheritCompanyConfig ? "empresa" : "ponto";\n' +
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
      'Retorna os dados completos de um ponto específico, incluindo o campo `inheritCompanyConfig` e todas as configurações ANPR.\n\n' +
      '**Uso no frontend:**\n' +
      'Use este endpoint para carregar os dados de um ponto ao abrir tela de edição ou detalhes. ' +
      'Se `inheritCompanyConfig` for `true`, os campos ANPR podem ser `null` (herda da empresa).\n\n' +
      '**Exemplo de uso no frontend:**\n' +
      '```javascript\n' +
      'const point = await fetch(`/point/${pointId}`, {\n' +
      '  headers: { Authorization: `Bearer ${token}` }\n' +
      '}).then(r => r.json());\n' +
      '\n' +
      '// Verificar fonte da configuração ANPR\n' +
      'if (point.inheritCompanyConfig) {\n' +
      '  // Usar valores da empresaConfig\n' +
      '  const config = companyConfig;\n' +
      '} else {\n' +
      '  // Usar valores do ponto (com fallback empresa para nulls)\n' +
      '  const config = {\n' +
      '    autoRegister: point.anprAutoRegister ?? companyConfig.anprAutoRegister,\n' +
      '    cooldown: point.anprAutoRegisterCooldownSeconds ?? companyConfig.anprAutoRegisterCooldownSeconds,\n' +
      '    confidence: point.anprConfidenceThreshold ?? companyConfig.anprConfidenceThreshold,\n' +
      '  };\n' +
      '}\n' +
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
      'Envie apenas os campos que deseja alterar.\n\n' +
      '**Campo `inheritCompanyConfig`:**\n' +
      '- `true`: O ponto herda TODAS as configurações ANPR da empresa (ignora campos ANPR)\n' +
      '- `false`: O ponto usa seus próprios valores dos campos ANPR\n\n' +
      '**Campos ANPR (usados quando inheritCompanyConfig = false):**\n' +
      '- `anprAutoRegister`: Ativa/desativa o registro automático de viagens\n' +
      '- `anprSaveUnrecognizedPhotos`: Salva foto quando placa não é reconhecida\n' +
      '- `anprAutoRegisterCooldownSeconds`: Intervalo mínimo entre registros do mesmo veículo\n' +
      '- `anprConfidenceThreshold`: Confiança mínima para aceitar leitura (0 a 1)\n' +
      '- `anprMatchTimeoutSeconds`: Timeout para confirmar leitura de placa\n' +
      '- `anprConfirmationReads`: Número de leituras consecutivas para confirmar\n' +
      '- `anprStaleAfterSeconds`: Tempo para considerar observação expirada\n' +
      '- `anprRecognitionMode`: `local` | `verified` | `external` (modo de reconhecimento neste ponto)\n' +
      '- `anprExternalProvider`: Provider externo (`google_vision`)\n' +
      '- `anprExternalMinConfidence`: Confiança mínima para aceitar a placa da API externa (0 a 1)\n' +
      '- `anprExternalTimeoutMs`: Timeout em milissegundos da API externa\n' +
      '- `anprExternalFallbackToLocal`: Usar leitura local quando a API externa falhar\n' +
      '> Envie `null` em um campo ANPR para voltar a herdar o valor da empresa naquele campo.\n' +
      '> As credenciais da API externa são globais (variáveis de ambiente), não por ponto.\n\n' +
      '**Exemplo — Ativar herança de config da empresa:**\n' +
      '```json\n' +
      '{ "inheritCompanyConfig": true }\n' +
      '```\n\n' +
      '**Exemplo — Desativar herança e customizar config:**\n' +
      '```json\n' +
      '{\n' +
      '  "inheritCompanyConfig": false,\n' +
      '  "anprAutoRegister": true,\n' +
      '  "anprAutoRegisterCooldownSeconds": 120,\n' +
      '  "anprConfidenceThreshold": 0.95\n' +
      '}\n' +
      '```\n\n' +
      '**Exemplo — Ativar auto-registration apenas neste ponto (herdando outros params da empresa):**\n' +
      '```json\n' +
      '{\n' +
      '  "inheritCompanyConfig": false,\n' +
      '  "anprAutoRegister": true\n' +
      '}\n' +
      '```\n\n' +
      '**Exemplo — Desativar auto-registration neste ponto:**\n' +
      '```json\n' +
      '{ "anprAutoRegister": false }\n' +
      '```\n\n' +
      '**Exemplo — Exigir API externa de reconhecimento apenas neste ponto:**\n' +
      '```json\n' +
      '{\n' +
      '  "inheritCompanyConfig": false,\n' +
      '  "anprRecognitionMode": "verified",\n' +
      '  "anprExternalProvider": "google_vision",\n' +
      '  "anprExternalMinConfidence": 0.75\n' +
      '}\n' +
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
