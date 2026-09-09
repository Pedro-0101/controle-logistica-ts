import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, ZodResponse } from 'zod-nest';
import { AnprService } from './anpr.service.js';
import { CameraService } from '../camera/camera.service.js';
import { ReconhecerImagemDto } from './dto/reconhecer-imagem.schema.js';
import { PlateResultDto } from './dto/plate-result.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

@ApiTags('ANPR')
@ApiBearerAuth()
@Controller('anpr')
export class AnprController {
  constructor(
    private readonly anprService: AnprService,
    private readonly cameraService: CameraService,
  ) {}

  @Post('reconhecer-camera/:id')
  @ApiOperation({
    summary: 'Reconhecer placa pela câmera cadastrada',
    description:
      'Captura um snapshot da câmera IP cadastrada e retorna a placa reconhecida.\n\n' +
      'Fluxo interno:\n' +
      '1. Busca a câmera pelo ID informado (deve pertencer à empresa do usuário autenticado).\n' +
      '2. Envia os dados de conexão da câmera (IP, porta, usuário, senha, tipo de autenticação e, opcionalmente, a `snapshotUrl`) ao microserviço ANPR (Python/PaddleOCR).\n' +
      '3. O microserviço baixa a imagem do snapshot — usando a URL configurada ou tentando auto-descobrir o endpoint — e roda o OCR.\n' +
      '4. A placa é normalizada para o formato Mercosul (`ABC1D23`) ou antigo (`ABC1234`) e devolvida com o score de confiança.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da câmera cadastrada',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: PlateResultDto })
  @ApiResponse({ status: 404, description: 'Câmera não encontrada' })
  @ApiResponse({ status: 422, description: 'Placa não reconhecida na imagem capturada' })
  @ApiResponse({ status: 502, description: 'Falha ao capturar imagem da câmera ou microserviço ANPR indisponível' })
  async reconhecerCamera(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const camera = await this.cameraService.findOne(id, user);
    return this.anprService.reconhecerCamera(camera);
  }

  @Post('reconhecer-imagem')
  @ApiOperation({
    summary: 'Reconhecer placa em imagem enviada',
    description:
      'Reconhece a placa em uma imagem enviada diretamente, sem envolver câmera.\n\n' +
      'Útil para testes e integrações manuais: o corpo deve conter a imagem (JPEG/PNG) codificada em base64. ' +
      'O microserviço ANPR decodifica a imagem, roda o OCR e devolve a placa normalizada com o score de confiança.',
  })
  @ZodResponse({ status: 200, type: PlateResultDto })
  @ApiResponse({ status: 400, description: 'Imagem inválida' })
  @ApiResponse({ status: 422, description: 'Placa não reconhecida na imagem' })
  reconhecerImagem(
    @Body(new ZodValidationPipe(ReconhecerImagemDto)) body: ReconhecerImagemDto,
  ) {
    return this.anprService.reconhecerImagem(body.imagemBase64);
  }
}
