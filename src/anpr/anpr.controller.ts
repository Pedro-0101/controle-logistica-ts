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
    description: 'Captura o snapshot da câmera cadastrada e retorna a placa reconhecida.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da câmera',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @ZodResponse({ status: 200, type: PlateResultDto })
  @ApiResponse({ status: 404, description: 'Câmera não encontrada' })
  @ApiResponse({ status: 422, description: 'Placa não reconhecida' })
  @ApiResponse({ status: 502, description: 'Falha ao capturar imagem da câmera' })
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
    description: 'Reconhece a placa em uma imagem codificada em base64.',
  })
  @ZodResponse({ status: 200, type: PlateResultDto })
  @ApiResponse({ status: 400, description: 'Imagem inválida' })
  @ApiResponse({ status: 422, description: 'Placa não reconhecida' })
  reconhecerImagem(
    @Body(new ZodValidationPipe(ReconhecerImagemDto)) body: ReconhecerImagemDto,
  ) {
    return this.anprService.reconhecerImagem(body.imagemBase64);
  }
}
