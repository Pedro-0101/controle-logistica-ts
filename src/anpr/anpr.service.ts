import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Camera } from '../camera/entities/camera.entity.js';

export interface PlacaReconhecida {
  placa: string;
  formato: string;
  confianca: number;
  raw: string;
  cameraUrlEncontrada?: string;
  fotoPath?: string;
}

interface ReconhecerCameraPayload {
  host: string;
  port: number;
  user: string;
  password: string;
  auth: string;
  camera_url?: string;
}

@Injectable()
export class AnprService {
  private readonly baseUrl: string;

  constructor(configService: ConfigService) {
    this.baseUrl = (
      configService.get<string>('ANPR_SERVICE_URL') ?? 'http://localhost:8000'
    ).replace(/\/+$/, '');
  }

  async reconhecerCamera(camera: Camera): Promise<PlacaReconhecida> {
    const payload: ReconhecerCameraPayload = {
      host: camera.ip,
      port: camera.port,
      user: camera.username,
      password: camera.password,
      auth: camera.authType,
    };
    if (camera.snapshotUrl) {
      payload.camera_url = camera.snapshotUrl;
    }
    return this.post('/reconhecer', payload);
  }

  async reconhecerImagem(imagemBase64: string): Promise<PlacaReconhecida> {
    return this.post('/reconhecer-imagem', { imagem_base64: imagemBase64 });
  }

  private async post(path: string, body: unknown): Promise<PlacaReconhecida> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new BadGatewayException('Serviço ANPR indisponível');
    }

    if (!response.ok) {
      throw this.mapError(response.status, await this.readDetail(response));
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      placa: String(data.placa),
      formato: String(data.formato),
      confianca: Number(data.confianca),
      raw: String(data.raw),
      cameraUrlEncontrada:
        data.camera_url_encontrada != null
          ? String(data.camera_url_encontrada)
          : undefined,
      fotoPath: data.foto_path != null ? String(data.foto_path) : undefined,
    };
  }

  private async readDetail(response: Response): Promise<string | undefined> {
    try {
      const data = (await response.json()) as { detail?: unknown };
      if (typeof data.detail === 'string') {
        return data.detail;
      }
      return data.detail != null ? JSON.stringify(data.detail) : undefined;
    } catch {
      return undefined;
    }
  }

  private mapError(status: number, detail?: string): Error {
    const message = detail ?? `Erro no serviço ANPR (${status})`;
    switch (status) {
      case 400:
        return new BadRequestException(message);
      case 422:
        return new UnprocessableEntityException(message);
      case 502:
        return new BadGatewayException(message);
      default:
        return new InternalServerErrorException(message);
    }
  }
}
