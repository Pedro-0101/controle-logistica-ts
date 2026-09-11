import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Camera } from './entities/camera.entity.js';

interface MediaMTXPathConfig {
  source: string;
  sourceOnDemand: boolean;
  sourceFingerprint?: string;
}

export interface StreamUrls {
  hlsUrl: string;
  webrtcUrl: string;
  rtspUrl: string;
}

@Injectable()
export class MediaMTXService {
  private readonly logger = new Logger(MediaMTXService.name);
  private readonly apiBase: string;
  private readonly hlsBase: string;
  private readonly webrtcBase: string;

  constructor(config: ConfigService) {
    this.apiBase = (config.get<string>('MEDIAMTX_API_URL') ?? 'http://localhost:9997').replace(/\/+$/, '');
    this.hlsBase = (config.get<string>('MEDIAMTX_HLS_URL') ?? 'http://localhost:8888').replace(/\/+$/, '');
    this.webrtcBase = (config.get<string>('MEDIAMTX_WEBRTC_URL') ?? 'http://localhost:8889').replace(/\/+$/, '');
  }

  private buildRtspSource(camera: Camera): string {
    const auth = camera.username ? `${camera.username}:${camera.password}@` : '';
    const port = camera.port === 554 ? '' : `:${camera.port}`;
    const channel = camera.snapshotUrl ?? '/Streaming/Channels/102';
    const path = channel.startsWith('/') ? channel : `/${channel}`;
    return `rtsp://${auth}${camera.ip}${port}${path}`;
  }

  private buildPathName(cameraId: string): string {
    return `camera-${cameraId}`;
  }

  async addPath(camera: Camera): Promise<void> {
    const pathName = this.buildPathName(camera.id);
    const body: MediaMTXPathConfig = {
      source: this.buildRtspSource(camera),
      sourceOnDemand: true,
      sourceFingerprint: 'allow',
    };

    try {
      const response = await fetch(`${this.apiBase}/v3/config/paths/add/${encodeURIComponent(pathName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`MediaMTX addPath falhou (${response.status}): ${text}`);
      } else {
        this.logger.log(`Path ${pathName} adicionado ao MediaMTX`);
      }
    } catch (error) {
      this.logger.warn(`MediaMTX indisponível ao adicionar path ${pathName}: ${error}`);
    }
  }

  async removePath(cameraId: string): Promise<void> {
    const pathName = this.buildPathName(cameraId);

    try {
      const response = await fetch(`${this.apiBase}/v3/config/paths/delete/${encodeURIComponent(pathName)}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        this.logger.warn(`MediaMTX removePath falhou (${response.status}): ${text}`);
      } else {
        this.logger.log(`Path ${pathName} removido do MediaMTX`);
      }
    } catch (error) {
      this.logger.warn(`MediaMTX indisponível ao remover path ${pathName}: ${error}`);
    }
  }

  async pathExists(cameraId: string): Promise<boolean> {
    const pathName = this.buildPathName(cameraId);

    try {
      const response = await fetch(`${this.apiBase}/v3/config/paths/list`, {
        method: 'GET',
      });

      if (!response.ok) return false;
      const paths = await response.json() as Record<string, unknown>;
      return pathName in paths;
    } catch {
      return false;
    }
  }

  async listPaths(): Promise<string[]> {
    try {
      const response = await fetch(`${this.apiBase}/v3/config/paths/list`, {
        method: 'GET',
      });

      if (!response.ok) return [];
      const paths = await response.json() as Record<string, unknown>;
      return Object.keys(paths);
    } catch {
      return [];
    }
  }

  getStreamUrls(cameraId: string): StreamUrls {
    const pathName = this.buildPathName(cameraId);
    return {
      hlsUrl: `${this.hlsBase}/${pathName}/index.m3u8`,
      webrtcUrl: `${this.webrtcBase}/${pathName}`,
      rtspUrl: `rtsp://localhost:8554/${pathName}`,
    };
  }
}
