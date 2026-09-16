import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { CompanyConfigService } from './company-config.service.js';
import { UpdateCompanyConfigDto } from './dto/update-company-config.schema.js';
import { CompanyConfigResponseDto } from './dto/company-config-response.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('Company Config')
@ApiBearerAuth()
@Controller('company-config')
export class CompanyConfigController {
  constructor(private readonly configService: CompanyConfigService) {}

  @Get(':companyId')
  @ApiOperation({
    summary: 'Buscar configuração da empresa',
    description:
      'Retorna todas as configurações da empresa especificada pelo UUID.\n\n' +
      '**Sobre as configurações:**\n' +
      'A configuração é criada automaticamente quando a empresa é cadastrada, com valores padrão. ' +
      'Não é necessário criar manualmente.\n\n' +
      '**Campos retornados:**\n' +
      '- **Gerais:** `timezone`, `language`\n' +
      '- **Câmera defaults:** `cameraDefaultProtocol`, `cameraDefaultPort`, `cameraDefaultAuthType`, `cameraSnapshotIntervalMs`\n' +
      '- **ANPR:** `anprConfidenceThreshold`, `anprMatchTimeoutSeconds`, `anprConfirmationReads`, `anprStaleAfterSeconds`\n' +
      '- **Auto Registration:** `anprAutoRegister`, `anprSaveUnrecognizedPhotos`, `anprAutoRegisterCooldownSeconds`\n' +
      '- **Reconhecimento (modo externo):** `anprRecognitionMode`, `anprExternalProvider`, `anprExternalMinConfidence`, `anprExternalTimeoutMs`, `anprExternalFallbackToLocal`\n' +
      '- **Movimentação:** `movementAutoCloseMinutes`, `requireDriverName`, `requirePurpose`\n\n' +
      '**Modos de reconhecimento (`anprRecognitionMode`):**\n' +
      '- `local`: usa apenas o OCR do microserviço Python (padrão).\n' +
      '- `verified`: o OCR local confirma a placa e, em seguida, a imagem é enviada à API externa; ' +
      'a placa externa vence quando aceita, senão a leitura local é usada.\n' +
      '- `external`: a API externa é autoritativa; se ela não retornar uma placa válida, o sistema ' +
      'usa a leitura local apenas quando `anprExternalFallbackToLocal` for `true` — caso contrário, nenhum movimento é criado.\n\n' +
      '> As credenciais da API externa **não** ficam no banco: são lidas de variáveis de ambiente ' +
      '(`GOOGLE_VISION_API_KEY` — ou `GOOGLE_API_KEY` — e `GOOGLE_VISION_ENDPOINT`).\n' +
      '> Consulte as chamadas e o custo estimado em `GET /anpr/external-interactions`.\n\n' +
      '**Herança para pontos:**\n' +
      'Estes valores servem como padrão para todos os pontos da empresa. ' +
      'Cada ponto pode sobrescrever individualmente os campos ANPR via `PATCH /point/:id`.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CompanyConfigResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão para acessar a configuração desta empresa' })
  @ApiResponse({ status: 404, description: 'Configuração não encontrada para a empresa informada' })
  findOne(
    @Param('companyId') companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configService.findOne(companyId, user);
  }

  @Patch(':companyId')
  @ApiOperation({
    summary: 'Atualizar configuração da empresa',
    description:
      'Atualiza parcialmente as configurações da empresa. Apenas os campos enviados são alterados.\n\n' +
      '**Configurações de Auto Registration (ANPR):**\n' +
      '- `anprAutoRegister`: Ativa/desativa o registro automático de movimentação por ANPR. ' +
      'Quando `true`, o sistema cria movimentos automaticamente ao detectar placas.\n' +
      '- `anprSaveUnrecognizedPhotos`: Quando `true`, salva foto de evidência quando a placa não ' +
      'é reconhecida na base de dados (útil para revisão manual).\n' +
      '- `anprAutoRegisterCooldownSeconds`: Intervalo mínimo em segundos entre registros automáticos ' +
      'do mesmo veículo no mesmo ponto. Evita duplicidades.\n\n' +
      '**Configurações de ANPR (qualidade de leitura):**\n' +
      '- `anprConfidenceThreshold`: Confiança mínima (0 a 1) para aceitar uma leitura de placa. ' +
      'Valores mais altos = menos falsos positivos, mais leituras rejeitadas.\n' +
      '- `anprMatchTimeoutSeconds`: Tempo máximo em segundos para confirmar uma placa ' +
      '(aguardar leituras consecutivas).\n' +
      '- `anprConfirmationReads`: Número de leituras consecutivas da mesma placa para confirmar.\n' +
      '- `anprStaleAfterSeconds`: Tempo para considerar uma observação expirada (stale).\n\n' +
      '**Configurações de Reconhecimento (modo externo):**\n' +
      '- `anprRecognitionMode`: `local` (só OCR local), `verified` (OCR local + verificação em API externa, ' +
      'a placa externa vence quando válida) ou `external` (API externa autoritativa).\n' +
      '- `anprExternalProvider`: Provider externo usado (atualmente `google_vision`).\n' +
      '- `anprExternalMinConfidence`: Confiança mínima (0 a 1) para aceitar a placa retornada pela API externa.\n' +
      '- `anprExternalTimeoutMs`: Timeout em milissegundos da chamada à API externa.\n' +
      '- `anprExternalFallbackToLocal`: Quando `true`, usa a leitura local se a API externa não retornar ' +
      'placa válida. Quando `false` (modo `external`), o movimento não é criado nesse caso.\n\n' +
      '**Configurações de Câmera (defaults):**\n' +
      '- `cameraDefaultProtocol`: Protocolo padrão para novas câmeras (http/https)\n' +
      '- `cameraDefaultPort`: Porta padrão para novas câmeras\n' +
      '- `cameraDefaultAuthType`: Tipo de autenticação padrão (digest/basic)\n' +
      '- `cameraSnapshotIntervalMs`: Intervalo de captura de snapshots em milissegundos\n\n' +
      '**Configurações de Movimentação:**\n' +
      '- `movementAutoCloseMinutes`: Minutos para auto-fechar movimento aberto\n' +
      '- `requireDriverName`: Exigir nome do motorista ao registrar movimentação\n' +
      '- `requirePurpose`: Exigir motivo ao registrar movimentação\n\n' +
      '**Exemplo — Ativar auto-registration:**\n' +
      '```json\n' +
      '{\n' +
      '  "anprAutoRegister": true,\n' +
      '  "anprSaveUnrecognizedPhotos": true,\n' +
      '  "anprAutoRegisterCooldownSeconds": 30\n' +
      '}\n' +
      '```\n\n' +
      '**Exemplo — Ajustar qualidade de leitura:**\n' +
      '```json\n' +
      '{\n' +
      '  "anprConfidenceThreshold": 0.90,\n' +
      '  "anprConfirmationReads": 3,\n' +
      '  "anprMatchTimeoutSeconds": 8\n' +
      '}\n' +
      '```\n\n' +
      '**Exemplo — Reconhecimento verificado por API externa (Google Vision):**\n' +
      '```json\n' +
      '{\n' +
      '  "anprRecognitionMode": "verified",\n' +
      '  "anprExternalProvider": "google_vision",\n' +
      '  "anprExternalMinConfidence": 0.7,\n' +
      '  "anprExternalTimeoutMs": 8000,\n' +
      '  "anprExternalFallbackToLocal": true\n' +
      '}\n' +
      '```\n\n' +
      '**Exemplo — Exigir API externa (sem fallback local):**\n' +
      '```json\n' +
      '{\n' +
      '  "anprRecognitionMode": "external",\n' +
      '  "anprExternalFallbackToLocal": false\n' +
      '}\n' +
      '```\n\n' +
      '**Exemplo — Voltar ao reconhecimento local:**\n' +
      '```json\n' +
      '{ "anprRecognitionMode": "local" }\n' +
      '```\n\n' +
      '**Exemplo — Configurar comportamento de movimentação:**\n' +
      '```json\n' +
      '{\n' +
      '  "movementAutoCloseMinutes": 120,\n' +
      '  "requireDriverName": true,\n' +
      '  "requirePurpose": false\n' +
      '}\n' +
      '```',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa cuja configuração será atualizada',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CompanyConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos (valores fora dos limites, tipos incorretos)' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido. Faça login via POST /auth/login' })
  @ApiResponse({ status: 403, description: 'Usuário não possui permissão de admin na empresa' })
  @ApiResponse({ status: 404, description: 'Configuração não encontrada para a empresa informada' })
  update(
    @Param('companyId') companyId: string,
    @Body(new ZodValidationPipe(UpdateCompanyConfigDto)) updateDto: UpdateCompanyConfigDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configService.update(companyId, updateDto, user);
  }
}
