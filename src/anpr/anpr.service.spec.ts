import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AnprService } from './anpr.service.js';
import type { Camera } from '../camera/entities/camera.entity.js';

describe('AnprService', () => {
  let service: AnprService;
  let fetchMock: ReturnType<typeof vi.fn>;

  const camera = {
    ip: '192.168.11.241',
    port: 80,
    username: 'admin',
    password: 'senha',
    authType: 'digest',
    snapshotUrl: null,
  } as unknown as Camera;

  beforeEach(async () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnprService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn(() => 'http://anpr:8000') },
        },
      ],
    }).compile();

    service = module.get<AnprService>(AnprService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('reconhecerImagem deve chamar o microserviço e mapear a resposta', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        placa: 'ABC1D23',
        formato: 'mercosul',
        confianca: 0.99,
        raw: 'ABC1D23',
        box: [120, 240, 320, 300],
      }),
    });

    const result = await service.reconhecerImagem('base64fake');

    expect(result).toEqual({
      placa: 'ABC1D23',
      formato: 'mercosul',
      confianca: 0.99,
      raw: 'ABC1D23',
      box: [120, 240, 320, 300],
      cameraUrlEncontrada: undefined,
      fotoPath: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://anpr:8000/reconhecer-imagem',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reconhecerImagem deve aceitar resposta sem box', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        placa: 'ABC1D23',
        formato: 'mercosul',
        confianca: 0.99,
        raw: 'ABC1D23',
      }),
    });

    const result = await service.reconhecerImagem('base64fake');

    expect(result.box).toBeUndefined();
  });

  it('reconhecerCamera deve enviar os dados da câmera ao microserviço', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        placa: 'ABC1234',
        formato: 'antiga',
        confianca: 0.95,
        raw: 'ABC1234',
        camera_url_encontrada: 'http://192.168.11.241/snapshot.jpg',
        foto_path: '/data/imagens/x.jpg',
      }),
    });

    const result = await service.reconhecerCamera(camera);

    expect(result.placa).toBe('ABC1234');
    expect(result.cameraUrlEncontrada).toBe('http://192.168.11.241/snapshot.jpg');
    expect(result.fotoPath).toBe('/data/imagens/x.jpg');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://anpr:8000/reconhecer',
      expect.objectContaining({
        body: JSON.stringify({
          host: '192.168.11.241',
          port: 80,
          user: 'admin',
          password: 'senha',
          auth: 'digest',
        }),
      }),
    );
  });

  it('reconhecerCamera deve incluir camera_url quando snapshotUrl existe', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        placa: 'ABC1234',
        formato: 'antiga',
        confianca: 0.95,
        raw: 'ABC1234',
      }),
    });

    await service.reconhecerCamera({
      ...camera,
      snapshotUrl: 'http://192.168.11.241/snapshot.jpg',
    });

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      host: '192.168.11.241',
      camera_url: 'http://192.168.11.241/snapshot.jpg',
    });
  });

  it('deve lançar BadGatewayException quando o serviço está indisponível', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));

    await expect(service.reconhecerImagem('x')).rejects.toThrow(
      'Serviço ANPR indisponível',
    );
  });

  describe('mapeamento de erros', () => {
    const nonOkResponse = (status: number, detail?: unknown) => ({
      ok: false,
      status,
      json: async () => ({ detail }),
    });

    it('status 400 deve virar BadRequestException com o detalhe', async () => {
      fetchMock.mockResolvedValue(nonOkResponse(400, 'Imagem inválida'));

      await expect(service.reconhecerImagem('x')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reconhecerImagem('x')).rejects.toThrow('Imagem inválida');
    });

    it('status 422 deve virar UnprocessableEntityException', async () => {
      fetchMock.mockResolvedValue(nonOkResponse(422, 'Placa não reconhecida'));

      await expect(service.reconhecerImagem('x')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('status 502 deve virar BadGatewayException', async () => {
      fetchMock.mockResolvedValue(nonOkResponse(502, 'Falha na câmera'));

      await expect(service.reconhecerImagem('x')).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('status desconhecido deve virar InternalServerErrorException', async () => {
      fetchMock.mockResolvedValue(nonOkResponse(500));

      await expect(service.reconhecerImagem('x')).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.reconhecerImagem('x')).rejects.toThrow(
        'Erro no serviço ANPR (500)',
      );
    });

    it('detalhe não-textual deve ser serializado em JSON', async () => {
      fetchMock.mockResolvedValue(nonOkResponse(400, { campo: 'imagem' }));

      await expect(service.reconhecerImagem('x')).rejects.toThrow('{"campo":"imagem"}');
    });
  });

  it('deve usar http://127.0.0.1:8000 como fallback sem configuração', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        placa: 'ABC1234',
        formato: 'antiga',
        confianca: 0.95,
        raw: 'ABC1234',
      }),
    });

    const fallbackService = new AnprService({
      get: vi.fn(() => undefined),
    } as unknown as ConfigService);

    await fallbackService.reconhecerImagem('base64fake');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/reconhecer-imagem',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  describe('upsertMonitor', () => {
    it('deve enviar config resolvida para o serviço ANPR', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await service.upsertMonitor(camera, {
        intervalSeconds: 2,
        staleAfterSeconds: 10,
        confirmationReads: 3,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://anpr:8000/monitors/undefined',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            host: '192.168.11.241',
            port: 80,
            user: 'admin',
            password: 'senha',
            auth: 'digest',
            interval_seconds: 2,
            stale_after_seconds: 10,
            confirmation_reads: 3,
          }),
        }),
      );
    });
  });
});
