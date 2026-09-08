import { Test, TestingModule } from '@nestjs/testing';
import { AdminUnityController } from './admin-unity.controller.js';
import { AdminUnityService } from './admin-unity.service.js';

describe('AdminUnityController', () => {
  let controller: AdminUnityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUnityController],
      providers: [
        {
          provide: AdminUnityService,
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

    controller = module.get<AdminUnityController>(AdminUnityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
