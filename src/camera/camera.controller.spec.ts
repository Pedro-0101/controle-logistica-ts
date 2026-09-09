import { Test, TestingModule } from '@nestjs/testing';
import { CameraController } from './camera.controller.js';
import { CameraService } from './camera.service.js';

describe('CameraController', () => {
  let controller: CameraController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CameraController],
      providers: [
        {
          provide: CameraService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            update: vi.fn(),
            remove: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CameraController>(CameraController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
