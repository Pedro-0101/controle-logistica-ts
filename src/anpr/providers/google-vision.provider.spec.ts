import { ConfigService } from '@nestjs/config';
import {
  GoogleVisionProvider,
  extractPlateFromText,
  extractVisionText,
} from './google-vision.provider.js';
import { ExternalProviderError } from './plate-recognition.types.js';

const configWith = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const makeResponse = (status: number, body: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

describe('extractVisionText', () => {
  it('prefere fullTextAnnotation', () => {
    expect(
      extractVisionText({
        responses: [{ fullTextAnnotation: { text: 'ABC1D23' }, textAnnotations: [{ description: 'x' }] }],
      }),
    ).toBe('ABC1D23');
  });

  it('usa textAnnotations quando não há fullTextAnnotation', () => {
    expect(
      extractVisionText({ responses: [{ textAnnotations: [{ description: 'ABC 1D23' }] }] }),
    ).toBe('ABC 1D23');
  });

  it('retorna vazio para payload inválido', () => {
    expect(extractVisionText(null)).toBe('');
    expect(extractVisionText({ responses: [] })).toBe('');
  });
});

describe('extractPlateFromText', () => {
  it('retorna confiança alta para token isolado', () => {
    expect(extractPlateFromText('ABC1D23')).toEqual({ plate: 'ABC1D23', confidence: 0.95 });
  });

  it('retorna confiança menor quando extraída de texto maior', () => {
    expect(extractPlateFromText('ABC-1D23')).toEqual({
      plate: 'ABC1D23',
      confidence: 0.8,
    });
  });

  it('retorna null quando não há placa', () => {
    expect(extractPlateFromText('sem placa')).toBeNull();
    expect(extractPlateFromText('   ')).toBeNull();
  });
});

describe('GoogleVisionProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconhece a placa e reporta métricas', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'ABC1D23' } }] })),
    );
    const provider = new GoogleVisionProvider(
      configWith({ GOOGLE_VISION_API_KEY: 'key', GOOGLE_VISION_ENDPOINT: 'http://vision.local/' }),
    );

    const result = await provider.recognize(Buffer.from('image'), { timeoutMs: 5000 });

    expect(result).toMatchObject({
      plate: 'ABC1D23',
      confidence: 0.95,
      raw: 'ABC1D23',
      provider: 'google_vision',
      httpStatus: 200,
      billableUnits: 1,
    });
    expect(result?.requestBytes).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://vision.local/v1/images:annotate?key=key',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('retorna null quando nenhuma placa é detectada', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, JSON.stringify({ responses: [{ textAnnotations: [{ description: 'ola mundo' }] }] })),
    );
    const provider = new GoogleVisionProvider(configWith({ GOOGLE_VISION_API_KEY: 'key' }));

    await expect(provider.recognize(Buffer.from('image'), { timeoutMs: 5000 })).resolves.toBeNull();
  });

  it('lança erro de configuração sem chave', async () => {
    const provider = new GoogleVisionProvider(configWith({}));

    await expect(provider.recognize(Buffer.from('image'), { timeoutMs: 5000 })).rejects.toMatchObject({
      kind: 'config',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aceita o alias GOOGLE_API_KEY', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'ABC1D23' } }] })),
    );
    const provider = new GoogleVisionProvider(configWith({ GOOGLE_API_KEY: 'alias-key' }));

    await expect(
      provider.recognize(Buffer.from('image'), { timeoutMs: 5000 }),
    ).resolves.toMatchObject({ plate: 'ABC1D23' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://vision.googleapis.com/v1/images:annotate?key=alias-key',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('mapeia timeout', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeout);
    const provider = new GoogleVisionProvider(configWith({ GOOGLE_VISION_API_KEY: 'key' }));

    await expect(provider.recognize(Buffer.from('image'), { timeoutMs: 10 })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('mapeia falha de rede', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new GoogleVisionProvider(configWith({ GOOGLE_VISION_API_KEY: 'key' }));

    const error = await provider.recognize(Buffer.from('image'), { timeoutMs: 10 }).catch((e) => e);
    expect(error).toBeInstanceOf(ExternalProviderError);
    expect(error.kind).toBe('network');
  });

  it('mapeia rate limit (429)', async () => {
    fetchMock.mockResolvedValue(makeResponse(429, 'quota'));
    const provider = new GoogleVisionProvider(configWith({ GOOGLE_VISION_API_KEY: 'key' }));

    await expect(provider.recognize(Buffer.from('image'), { timeoutMs: 10 })).rejects.toMatchObject({
      kind: 'rate_limited',
      httpStatus: 429,
    });
  });

  it('mapeia erro HTTP genérico', async () => {
    fetchMock.mockResolvedValue(makeResponse(500, 'boom'));
    const provider = new GoogleVisionProvider(configWith({ GOOGLE_VISION_API_KEY: 'key' }));

    await expect(provider.recognize(Buffer.from('image'), { timeoutMs: 10 })).rejects.toMatchObject({
      kind: 'http',
      httpStatus: 500,
    });
  });

  it('mapeia JSON inválido', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, 'not-json'));
    const provider = new GoogleVisionProvider(configWith({ GOOGLE_VISION_API_KEY: 'key' }));

    await expect(provider.recognize(Buffer.from('image'), { timeoutMs: 10 })).rejects.toMatchObject({
      kind: 'invalid',
    });
  });
});
