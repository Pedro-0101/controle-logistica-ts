import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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
  } as Camera;

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
      }),
    });

    const result = await service.reconhecerImagem('base64fake');

    expect(result).toEqual({
      placa: 'ABC1D23',
      formato: 'mercosul',
      confianca: 0.99,
      raw: 'ABC1D23',
      cameraUrlEncontrada: undefined,
      fotoPath: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://anpr:8000/reconhecer-imagem',
      expect.objectContaining({ method: 'POST' }),
    );
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

  it('deve lançar BadGatewayException quando o serviço está indisponível', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));

    await expect(service.reconhecerImagem('x')).rejects.toThrow(
      'Serviço ANPR indisponível',
    );
  });
});
