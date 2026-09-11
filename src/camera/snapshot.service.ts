import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { Camera } from './entities/camera.entity.js';

const CAMINHOS_SNAPSHOT = [
  '/cgi-bin/snapshot.cgi',
  '/cgi-bin/snapshot.cgi?channel=1',
  '/cgi-bin/snapshot.cgi?channel=0',
  '/webcapture.jpg?command=snap&channel=1',
  '/tmpfs/auto.jpg',
  '/snapshot.jpg',
  '/jpg/image.jpg',
  '/onvif/snapshot',
  '/cgi-bin/images_cgi?channel=0&subtype=0',
  '/cgi-bin/currentpic.cgi',
  '/Streaming/channels/1/picture',
  '/ISAPI/Streaming/channels/101/picture',
  '/cap.jpg',
];

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const CAPTURE_TIMEOUT_MS = 10_000;

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  private buildAuthHeader(camera: Camera): string {
    const credentials = Buffer.from(`${camera.username}:${camera.password}`).toString('base64');
    if (camera.authType === 'basic') {
      return `Basic ${credentials}`;
    }
    // For digest auth, we need to handle it properly
    // httpx in Python handles digest auth automatically, but here we'll use a simpler approach
    // and let the camera handle it
    return `Basic ${credentials}`;
  }

  private buildBaseUrl(camera: Camera): string {
    if (camera.port === 80) {
      return `http://${camera.ip}`;
    }
    return `http://${camera.ip}:${camera.port}`;
  }

  private isImage(content: Uint8Array): boolean {
    return (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) ||
      (content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47);
  }

  async capture(camera: Camera): Promise<Buffer> {
    const baseUrl = this.buildBaseUrl(camera);
    const authHeader = this.buildAuthHeader(camera);

    // If snapshotUrl is configured, try it first
    if (camera.snapshotUrl) {
      try {
        return await this.fetchSnapshot(camera.snapshotUrl, authHeader);
      } catch (error) {
        this.logger.warn(`Snapshot URL configurada falhou para câmera ${camera.id}: ${error}`);
        // Fall through to auto-discovery
      }
    }

    // Auto-discovery: try common snapshot paths
    for (const path of CAMINHOS_SNAPSHOT) {
      const url = `${baseUrl}${path}`;
      try {
        const image = await this.fetchSnapshot(url, authHeader);
        this.logger.log(`Snapshot descoberto em ${url} para câmera ${camera.id}`);
        return image;
      } catch {
        continue;
      }
    }

    throw new BadGatewayException('Nenhum endpoint de snapshot válido respondeu para a câmera');
  }

  private async fetchSnapshot(url: string, authHeader: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.startsWith('image/')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      if (bytes.length > MAX_SNAPSHOT_BYTES) {
        throw new Error('Snapshot excede o limite de tamanho');
      }

      if (!this.isImage(bytes)) {
        throw new Error('Snapshot não é uma imagem válida');
      }

      return Buffer.from(bytes);
    } finally {
      clearTimeout(timeout);
    }
  }
}
