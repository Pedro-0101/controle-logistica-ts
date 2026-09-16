export type ExternalProviderErrorKind =
  | 'config'
  | 'timeout'
  | 'rate_limited'
  | 'http'
  | 'network'
  | 'invalid';

export interface ExternalProviderErrorDetails {
  httpStatus?: number;
  requestBytes?: number;
  responseBytes?: number;
}

export class ExternalProviderError extends Error {
  readonly httpStatus?: number;
  readonly requestBytes?: number;
  readonly responseBytes?: number;

  constructor(
    message: string,
    readonly kind: ExternalProviderErrorKind,
    details: ExternalProviderErrorDetails = {},
  ) {
    super(message);
    this.name = 'ExternalProviderError';
    this.httpStatus = details.httpStatus;
    this.requestBytes = details.requestBytes;
    this.responseBytes = details.responseBytes;
  }
}

export interface PlateRecognitionResult {
  plate: string;
  confidence: number;
  raw: string;
  provider: string;
  httpStatus?: number;
  requestBytes?: number;
  responseBytes?: number;
  billableUnits?: number;
}

export interface PlateRecognitionOptions {
  timeoutMs: number;
}

export interface PlateRecognitionProvider {
  readonly name: string;
  recognize(
    image: Buffer,
    options: PlateRecognitionOptions,
  ): Promise<PlateRecognitionResult | null>;
}
