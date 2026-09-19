import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import type { Readable } from 'node:stream';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type StorageDriver = 'minio' | 'local';

/**
 * Armazenamento das fotos de evidência do ANPR.
 *
 * O driver padrão é o MinIO (S3-compatível); quando `STORAGE_DRIVER=local`
 * (ou o MinIO não está configurado) os arquivos são gravados em
 * `./storage/evidence/...`, preservando o comportamento antigo em ambientes
 * de desenvolvimento e testes.
 *
 * As chaves são sempre relativas (ex.: `evidence/{companyId}/{data}/{obsId}.jpg`).
 * No driver local elas são resolvidas dentro de `STORAGE_LOCAL_ROOT/storage`.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly bucket: string;
  private readonly localRoot: string;
  private readonly client?: MinioClient;

  constructor(private readonly config: ConfigService) {
    const driver = (this.config.get<string>('STORAGE_DRIVER') ?? 'local').toLowerCase();
    this.driver = driver === 'minio' ? 'minio' : 'local';
    this.bucket = this.config.get<string>('STORAGE_BUCKET') ?? 'controle-logistica';
    this.localRoot = this.config.get<string>('STORAGE_LOCAL_ROOT') ?? process.cwd();

    if (this.driver === 'minio') {
      this.client = new MinioClient({
        endPoint: this.config.get<string>('STORAGE_ENDPOINT') ?? '127.0.0.1',
        port: Number(this.config.get<string>('STORAGE_PORT') ?? 9000),
        useSSL: this.config.get<string>('STORAGE_USE_SSL') === 'true',
        accessKey: this.config.get<string>('STORAGE_ACCESS_KEY') ?? 'minioadmin',
        secretKey: this.config.get<string>('STORAGE_SECRET_KEY') ?? 'minioadmin',
      });
    }
  }

  get kind(): StorageDriver {
    return this.driver;
  }

  /** Garante o bucket do MinIO. Falhas não impedem o boot da API. */
  async onModuleInit() {
    if (!this.client) return;
    try {
      if (!(await this.client.bucketExists(this.bucket))) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Bucket "${this.bucket}" criado no MinIO`);
      }
    } catch (error) {
      this.logger.warn(
        `MinIO indisponível (bucket "${this.bucket}"): ${String(error)}. ` +
          'As fotos de evidência ficarão pendentes até o serviço voltar.',
      );
    }
  }

  /** Salva uma evidência e devolve a chave persistida. */
  async putEvidence(key: string, data: Buffer, contentType = 'image/jpeg'): Promise<string> {
    if (this.client) {
      await this.client.putObject(this.bucket, key, data, data.length, {
        'Content-Type': contentType,
      });
      return key;
    }
    const filePath = this.localPath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, data);
    return key;
  }

  /** Lê uma evidência previamente salva. Lança quando não existe. */
  async getEvidence(key: string): Promise<Buffer> {
    if (this.client) {
      const stream = (await this.client.getObject(this.bucket, key)) as Readable;
      return this.streamToBuffer(stream);
    }
    return fs.readFileSync(this.localPath(key));
  }

  /** Remove uma evidência. Não falha quando o objeto não existe. */
  async removeEvidence(key: string): Promise<void> {
    if (this.client) {
      await this.client.removeObject(this.bucket, key);
      return;
    }
    try {
      fs.rmSync(this.localPath(key), { force: true });
    } catch {
      /* já removido */
    }
  }

  private localPath(key: string): string {
    const normalized = key.replace(/^storage[\\/]/, '');
    return path.isAbsolute(normalized)
      ? normalized
      : path.join(this.localRoot, 'storage', normalized);
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
