import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Camera } from './entities/camera.entity.js';

interface MediaMTXPathConfig {
  source: string;
  sourceOnDemand: boolean;
  sourceFingerprint?: string;
}

// Substreams H.264 (compatíveis com navegadores via HLS/WebRTC).
const HIKVISION_SUBSTREAM_PATH = '/Streaming/Channels/102';
const DAHUA_SUBSTREAM_PATH = '/cam/realmonitor?channel=1&subtype=1';

const VENDOR_PROBE_TIMEOUT_MS = 3_000;

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
  private readonly apiAuth: string | undefined;

  constructor(config: ConfigService) {
    this.apiBase = (config.get<string>('MEDIAMTX_API_URL') ?? 'http://localhost:9997').replace(/\/+$/, '');
    this.hlsBase = (config.get<string>('MEDIAMTX_HLS_URL') ?? 'http://localhost:8888').replace(/\/+$/, '');
    this.webrtcBase = (config.get<string>('MEDIAMTX_WEBRTC_URL') ?? 'http://localhost:8889').replace(/\/+$/, '');

    const apiUser = config.get<string>('MEDIAMTX_API_USER');
    const apiPassword = config.get<string>('MEDIAMTX_API_PASSWORD');
    if (apiUser && apiPassword) {
      this.apiAuth = 'Basic ' + Buffer.from(`${apiUser}:${apiPassword}`).toString('base64');
    }
  }

  private apiHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiAuth) {
      headers['Authorization'] = this.apiAuth;
    }
    return headers;
  }

  private buildHttpBase(camera: Camera): string {
    const port = camera.port && camera.port !== 80 ? `:${camera.port}` : '';
    return `http://${camera.ip}${port}`;
  }

  private async buildRtspSource(camera: Camera): Promise<string> {
    const auth = camera.username ? `${camera.username}:${camera.password}@` : '';
    const path = await this.resolveRtspPath(camera);
    return `rtsp://${auth}${camera.ip}:554${path}`;
  }

  private async resolveRtspPath(camera: Camera): Promise<string> {
    const fromSnapshot = this.rtspPathFromSnapshotUrl(camera.snapshotUrl);
    if (fromSnapshot) return fromSnapshot;

    return this.detectRtspPath(camera);
  }

  private rtspPathFromSnapshotUrl(snapshotUrl: string | null): string | null {
    if (!snapshotUrl) return null;

    let pathname: string;
    try {
      pathname = new URL(snapshotUrl).pathname;
    } catch {
      pathname = snapshotUrl;
    }

    if (!pathname.startsWith('/')) pathname = `/${pathname}`;

    // Dahua / Intelbras (ex.: /cgi-bin/snapshot.cgi, /cam/realmonitor).
    if (/\/cgi-bin\/|\/cam\/realmonitor/i.test(pathname)) {
      return DAHUA_SUBSTREAM_PATH;
    }

    const isapiMatch = pathname.match(/\/ISAPI\/Streaming\/channels\/(\d+)/i);
    if (isapiMatch) return `/Streaming/Channels/${isapiMatch[1]}`;

    const channelMatch = pathname.match(/\/Streaming\/Channels\/(\d+)/i);
    if (channelMatch) return `/Streaming/Channels/${channelMatch[1]}`;

    return null;
  }

  /**
   * Detecta a família da câmera por endpoints que respondem sem credenciais:
   * - Hikvision: /ISAPI/System/deviceInfo responde 401 (existe); /cgi-bin/... 404.
   * - Dahua/Intelbras: /ISAPI/... responde 404; /cgi-bin/snapshot.cgi responde 401.
   */
  private async detectRtspPath(camera: Camera): Promise<string> {
    const base = this.buildHttpBase(camera);

    if (await this.endpointExists(`${base}/ISAPI/System/deviceInfo`)) {
      return HIKVISION_SUBSTREAM_PATH;
    }

    if (await this.endpointExists(`${base}/cgi-bin/snapshot.cgi`)) {
      return DAHUA_SUBSTREAM_PATH;
    }

    return HIKVISION_SUBSTREAM_PATH;
  }

  private async endpointExists(url: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VENDOR_PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(url, { method: 'GET', signal: controller.signal });
      return response.status !== 404;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildPathName(cameraId: string): string {
    return `camera-${cameraId}`;
  }

  async addPath(camera: Camera): Promise<void> {
    const pathName = this.buildPathName(camera.id);
    const body: MediaMTXPathConfig = {
      source: await this.buildRtspSource(camera),
      sourceOnDemand: true,
      sourceFingerprint: 'allow',
    };

    try {
      let response = await fetch(`${this.apiBase}/v3/config/paths/add/${encodeURIComponent(pathName)}`, {
        method: 'POST',
        headers: this.apiHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 400 && text.includes('already exists')) {
          await this.removePath(camera.id);
          response = await fetch(`${this.apiBase}/v3/config/paths/add/${encodeURIComponent(pathName)}`, {
            method: 'POST',
            headers: this.apiHeaders(),
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            const retryText = await response.text();
            this.logger.warn(`MediaMTX addPath após recriação falhou (${response.status}): ${retryText}`);
          } else {
            this.logger.log(`Path ${pathName} recriado no MediaMTX com sucesso`);
          }
        } else {
          this.logger.warn(`MediaMTX addPath falhou (${response.status}): ${text}`);
        }
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
        headers: this.apiHeaders(),
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
        headers: this.apiHeaders(),
      });

      if (!response.ok) return false;
      const data = await response.json() as { items?: Array<{ name?: string }> };
      return (data.items ?? []).some((item) => item.name === pathName);
    } catch {
      return false;
    }
  }

  async listPaths(): Promise<string[]> {
    try {
      const response = await fetch(`${this.apiBase}/v3/config/paths/list`, {
        method: 'GET',
        headers: this.apiHeaders(),
      });

      if (!response.ok) return [];
      const data = await response.json() as { items?: Array<{ name?: string }> };
      return (data.items ?? [])
        .map((item) => item.name)
        .filter((name): name is string => Boolean(name));
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
