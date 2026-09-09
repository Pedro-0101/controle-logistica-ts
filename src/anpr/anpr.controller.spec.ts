import { Test, TestingModule } from '@nestjs/testing';
import { AnprController } from './anpr.controller.js';
import { AnprService } from './anpr.service.js';
import { CameraService } from '../camera/camera.service.js';

describe('AnprController', () => {
  let controller: AnprController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnprController],
      providers: [
        {
          provide: AnprService,
          useValue: {
            reconhecerCamera: vi.fn(),
            reconhecerImagem: vi.fn(),
          },
        },
        {
          provide: CameraService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({ id: 'camera-1' }),
          },
        },
      ],
    }).compile();

    controller = module.get<AnprController>(AnprController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
