import { BadGatewayException, BadRequestException, ConflictException, Injectable, InternalServerErrorException,
  NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Camera } from '../camera/entities/camera.entity.js';
import { observationSchema, plateSchema, type CurrentObservation } from '../monitoring/observation.schema.js';

const recognitionSchema = z.object({
  placa: plateSchema, formato: z.enum(['mercosul', 'antiga']),
  confianca: z.number().min(0).max(1), raw: z.string(),
  box: z.array(z.number().finite()).length(4).nullish(),
  camera_url_encontrada: z.string().nullish(), foto_path: z.string().nullish(),
});
export interface PlacaReconhecida {
  placa: string; formato: string; confianca: number; raw: string;
  box?: number[]; cameraUrlEncontrada?: string; fotoPath?: string;
}

@Injectable()
export class AnprService {
  private readonly baseUrl: string;
  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('ANPR_SERVICE_URL') ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
  }
  private cameraPayload(camera: Camera) {
    return { host: camera.ip, port: camera.port, user: camera.username, password: camera.password,
      auth: camera.authType, ...(camera.snapshotUrl ? { camera_url: camera.snapshotUrl } : {}) };
  }
  reconhecerCamera(camera: Camera): Promise<PlacaReconhecida> {
    return this.post('/reconhecer', this.cameraPayload(camera));
  }
  reconhecerImagem(imagemBase64: string): Promise<PlacaReconhecida> {
    return this.post('/reconhecer-imagem', { imagem_base64: imagemBase64 });
  }
  async upsertMonitor(camera: Camera, config: { intervalSeconds: number; staleAfterSeconds: number; confirmationReads: number }): Promise<void> {
    await this.request(`/monitors/${encodeURIComponent(camera.id)}`, 'PUT', {
      ...this.cameraPayload(camera),
      interval_seconds: config.intervalSeconds,
      stale_after_seconds: config.staleAfterSeconds,
      confirmation_reads: config.confirmationReads,
    });
  }
  async deleteMonitor(cameraId: string): Promise<void> {
    try { await this.request(`/monitors/${encodeURIComponent(cameraId)}`, 'DELETE'); }
    catch (error) { if (!(error instanceof NotFoundException)) throw error; }
  }
  async listMonitors(): Promise<string[]> {
    const response = await this.request('/monitors', 'GET');
    try { return z.array(z.string()).parse(await response.json()); }
    catch { throw new BadGatewayException('Lista de monitores ANPR inválida'); }
  }
  async currentObservation(cameraId: string): Promise<CurrentObservation> {
    const response = await this.request(`/monitors/${encodeURIComponent(cameraId)}`, 'GET');
    try {
      const value = observationSchema.parse(await response.json());
      if (value.cameraId !== cameraId) throw new Error('camera mismatch');
      return value;
    } catch { throw new BadGatewayException('Resposta de monitoramento ANPR inválida'); }
  }
  async observationImage(cameraId: string, observationId: string): Promise<Buffer> {
    const response = await this.request(`/monitors/${encodeURIComponent(cameraId)}/observations/${encodeURIComponent(observationId)}/image`, 'GET');
    if (!response.headers.get('content-type')?.startsWith('image/jpeg') || !response.body) {
      throw new BadGatewayException('Evidência ANPR inválida');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 5 * 1024 * 1024) throw new Error('image limit');
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) throw new Error('jpeg signature');
      return bytes;
    } catch { await reader.cancel().catch(() => undefined); throw new BadGatewayException('Evidência ANPR inválida'); }
    finally { reader.releaseLock(); }
  }
  private async post(path: string, body: unknown): Promise<PlacaReconhecida> {
    const response = await this.request(path, 'POST', body, 30_000);
    try {
      const data = recognitionSchema.parse(await response.json());
      return { placa: data.placa, formato: data.formato, confianca: data.confianca, raw: data.raw,
        box: data.box ?? undefined, cameraUrlEncontrada: data.camera_url_encontrada ?? undefined, fotoPath: data.foto_path ?? undefined };
    } catch { throw new BadGatewayException('Resposta de reconhecimento ANPR inválida'); }
  }
  private async request(path: string, method: string, body?: unknown, timeoutMs = 3_000): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { method,
        signal: AbortSignal.timeout(timeoutMs),
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch { throw new BadGatewayException('Serviço ANPR indisponível'); }
    if (!response.ok) throw this.mapError(response.status, await this.readDetail(response));
    return response;
  }
  private async readDetail(response: Response): Promise<string | undefined> {
    try { const data = await response.json() as { detail?: unknown };
      return typeof data.detail === 'string' ? data.detail : data.detail != null ? JSON.stringify(data.detail) : undefined;
    } catch { return undefined; }
  }
  private mapError(status: number, detail?: string): Error {
    const message = detail ?? `Erro no serviço ANPR (${status})`;
    switch (status) {
      case 400: return new BadRequestException(message);
      case 404: return new NotFoundException('Monitor ou observação não encontrado');
      case 409: return new ConflictException('Observação expirada ou substituída');
      case 422: return new UnprocessableEntityException(message);
      case 502: return new BadGatewayException(message);
      case 503: case 504: return new BadGatewayException('Reconhecimento ocupado ou indisponível');
      default: return new InternalServerErrorException(message);
    }
  }
}
