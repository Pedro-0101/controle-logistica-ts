import { Controller, Get, Param, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'zod-nest';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { MonitoringService } from './monitoring.service.js';
import { CurrentObservationDto } from './dto/current-observation-response.schema.js';

@ApiTags('Cameras')
@ApiBearerAuth()
@Controller('camera')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get(':id/current-observation')
  @ApiOperation({
    summary: 'Consultar leitura recente da câmera (sem OCR sob demanda)',
    description:
      'Retorna o estado atual do monitoramento contínuo para a câmera informada.\n\n' +
      '**O que é monitoramento contínuo?**\n' +
      'O microserviço Python captura imagens da câmera IP a cada ~1s em background e executa OCR ' +
      'automaticamente. O resultado é mantido em memória e consultado por este endpoint.\n\n' +
      '**Fluxo de uso pelo front:**\n' +
      '1. O front chama este endpoint periodicamente (recomendado: polling a cada 2s)\n' +
      '2. Quando `status` = `"confirmed"`, significa que uma placa foi lida e confirmada (2+ leituras consecutivas)\n' +
      '3. O front exibe a placa, confiança e um botão "Confirmar" ao porteiro\n' +
      '4. O porteiro confirma → front chama `POST /movement/from-observation` com o `observationId`\n\n' +
      '**Possíveis valores de `status`:**\n' +
      '- `waiting`: Nenhum veículo detectado na imagem. Aguardar.\n' +
      '- `candidate`: Placa lida mas ainda não confirmada (menos de 2 leituras). Aguardar.\n' +
      '- `confirmed`: Placa confirmada. Pode ser confirmada pelo porteiro.\n' +
      '- `stale`: Veículo saiu da imagem ou observação expirou (>5s sem leitura). Leitura vencida.\n' +
      '- `offline`: Câmera sem conexão ou falha ao capturar. Verificar a câmera.\n\n' +
      '**Persistência de evidência:**\n' +
      'Na primeira consulta com status `"confirmed"`, a imagem (evidência) é baixada do Python ' +
      'e persistida no banco de dados. Consultas subsequentes para a mesma observação não ' +
      'repetem o download.\n\n' +
      '**Isolamento por empresa:**\n' +
      'Este endpoint só retorna observações de câmeras vinculadas à empresa do usuário autenticado.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da câmera a ser consultada',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: CurrentObservationDto })
  @ApiResponse({
    status: 401,
    description: 'Token JWT ausente ou inválido',
  })
  @ApiResponse({
    status: 404,
    description: 'Câmera não encontrada ou não pertence à empresa do usuário',
  })
  @ApiResponse({
    status: 400,
    description: 'Ponto ou unidade administrativa vinculados à câmera estão inválidos ou inativos',
  })
  current(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.monitoring.current(id, actor);
  }

  @Get(':id/observations/:observationId/image')
  @ApiOperation({
    summary: 'Baixar evidência fotográfica de uma observação',
    description:
      'Retorna a imagem JPEG capturada quando a observação foi registrada.\n\n' +
      '**Uso típico:**\n' +
      'Após obter uma observação com status `"confirmed"` via `GET /camera/:id/current-observation`, ' +
      'o front pode chamar este endpoint para exibir a foto do veículo ao porteiro.\n\n' +
      '**Comportamento:**\n' +
      '- A evidência é persistida no banco na primeira consulta à observação\n' +
      '- Consultas subsequentes retornam a mesma imagem (cache no banco)\n' +
      '- A evidência permanece acessível mesmo após a observação expirar (auditoria)\n' +
      '- Retorna 404 se a observação não existe ou a evidência não foi persistida\n' +
      '- Retorna 409 se a observação foi substituída por outra (novo veículo na câmera)',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da câmera',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ApiParam({
    name: 'observationId',
    description: 'UUID da observação (obtido via GET /camera/:id/current-observation)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Imagem JPEG da evidência',
    content: { 'image/jpeg': {} },
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT ausente ou inválido',
  })
  @ApiResponse({
    status: 404,
    description: 'Observação ou evidência não encontrada',
  })
  async image(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('observationId', ParseUUIDPipe) observationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const image = await this.monitoring.image(id, observationId, actor);
    return new StreamableFile(image, { type: 'image/jpeg', length: image.length });
  }
}
