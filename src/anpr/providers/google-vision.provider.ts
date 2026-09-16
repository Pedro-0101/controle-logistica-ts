import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizarPlaca } from '../plate.js';
import {
  ExternalProviderError,
  type PlateRecognitionOptions,
  type PlateRecognitionProvider,
  type PlateRecognitionResult,
} from './plate-recognition.types.js';

const DEFAULT_ENDPOINT = 'https://vision.googleapis.com';

interface VisionAnnotation {
  description?: string;
}

interface VisionResponse {
  responses?: Array<{
    textAnnotations?: VisionAnnotation[];
    fullTextAnnotation?: { text?: string };
    error?: { message?: string };
  }>;
}

/** Extrai o texto detectado do payload do Google Vision (full text ou anotações). */
export function extractVisionText(payload: unknown): string {
  const responses = (payload as VisionResponse | null)?.responses;
  if (!Array.isArray(responses) || responses.length === 0) return '';
  const first = responses[0];
  const full = first?.fullTextAnnotation?.text;
  if (typeof full === 'string' && full.trim()) return full;
  const annotations = first?.textAnnotations;
  if (!Array.isArray(annotations) || annotations.length === 0) return '';
  const description = annotations[0]?.description;
  return typeof description === 'string' ? description : '';
}

type NormalizedPlate = NonNullable<ReturnType<typeof normalizarPlaca>>;

/**
 * Normaliza o texto bruto do OCR externo em uma placa brasileira.
 *
 * A confiança é derivada do formato da detecção: quando a placa aparece como um
 * token isolado no texto (leitura limpa) usamos 0.95; quando é extraída de um
 * texto maior (ex.: várias linhas) usamos 0.8, pois houve mais concatenação.
 */
export function extractPlateFromText(text: string): { plate: string; confidence: number } | null {
  if (!text.trim()) return null;
  const normalized: NormalizedPlate | null = normalizarPlaca(text);
  if (!normalized) return null;
  const tokens = text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const exact = tokens.includes(normalized.valor);
  return { plate: normalized.valor, confidence: exact ? 0.95 : 0.8 };
}

@Injectable()
export class GoogleVisionProvider implements PlateRecognitionProvider {
  readonly name = 'google_vision';

  constructor(private readonly config: ConfigService) {}

  async recognize(
    image: Buffer,
    { timeoutMs }: PlateRecognitionOptions,
  ): Promise<PlateRecognitionResult | null> {
    const apiKey =
      this.config.get<string>('GOOGLE_VISION_API_KEY') ??
      this.config.get<string>('GOOGLE_API_KEY');
    if (!apiKey) {
      throw new ExternalProviderError(
        'GOOGLE_VISION_API_KEY (ou GOOGLE_API_KEY) não configurada',
        'config',
      );
    }
    const endpoint = (
      this.config.get<string>('GOOGLE_VISION_ENDPOINT') ?? DEFAULT_ENDPOINT
    ).replace(/\/+$/, '');
    const body = JSON.stringify({
      requests: [
        {
          image: { content: image.toString('base64') },
          features: [{ type: 'TEXT_DETECTION', maxResults: 10 }],
        },
      ],
    });
    const requestBytes = Buffer.byteLength(body);

    let response: Response;
    try {
      response = await fetch(
        `${endpoint}/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ExternalProviderError(
          'Tempo de resposta da API externa excedido',
          'timeout',
          { requestBytes },
        );
      }
      throw new ExternalProviderError(
        'Falha de rede ao chamar a API externa',
        'network',
        { requestBytes },
      );
    }

    const text = await response.text().catch(() => '');
    const responseBytes = Buffer.byteLength(text);
    if (!response.ok) {
      throw new ExternalProviderError(
        `API externa respondeu ${response.status}`,
        response.status === 429 ? 'rate_limited' : 'http',
        { httpStatus: response.status, requestBytes, responseBytes },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ExternalProviderError(
        'Resposta inválida da API externa',
        'invalid',
        { httpStatus: response.status, requestBytes, responseBytes },
      );
    }

    const detected = extractVisionText(payload);
    const extracted = extractPlateFromText(detected);
    if (!extracted) return null;

    return {
      plate: extracted.plate,
      confidence: extracted.confidence,
      raw: detected,
      provider: this.name,
      httpStatus: response.status,
      requestBytes,
      responseBytes,
      billableUnits: 1,
    };
  }
}
