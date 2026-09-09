import { Test, TestingModule } from '@nestjs/testing';
import { AnprController } from './anpr.controller.js';
import { AnprService } from './anpr.service.js';
import { CameraService } from '../camera/camera.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

const user: AuthenticatedUser = {
  userId: 'user-1',
  email: 'joao@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('AnprController', () => {
  let controller: AnprController;
  const anprService = {
    reconhecerCamera: vi.fn(),
    reconhecerImagem: vi.fn(),
  };
  const cameraService = { findOne: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnprController],
      providers: [
        { provide: AnprService, useValue: anprService },
        { provide: CameraService, useValue: cameraService },
      ],
    }).compile();

    controller = module.get<AnprController>(AnprController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reconhecerCamera busca a câmera e delega ao anprService', async () => {
    cameraService.findOne.mockResolvedValue({ id: 'camera-1' });
    anprService.reconhecerCamera.mockResolvedValue({ placa: 'ABC1D23' });

    await expect(controller.reconhecerCamera('camera-1', user)).resolves.toEqual({
      placa: 'ABC1D23',
    });
    expect(cameraService.findOne).toHaveBeenCalledWith('camera-1', user);
    expect(anprService.reconhecerCamera).toHaveBeenCalledWith({ id: 'camera-1' });
  });

  it('reconhecerImagem delega a imagem base64 ao anprService', () => {
    anprService.reconhecerImagem.mockReturnValue({ placa: 'ABC1234' });

    expect(controller.reconhecerImagem({ imagemBase64: 'base64' } as never)).toEqual({
      placa: 'ABC1234',
    });
    expect(anprService.reconhecerImagem).toHaveBeenCalledWith('base64');
  });
});
