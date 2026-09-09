import { Test, TestingModule } from '@nestjs/testing';
import { PointController } from './point.controller.js';
import { PointService } from './point.service.js';

describe('PointController', () => {
  let controller: PointController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PointController],
      providers: [
        {
          provide: PointService,
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

    controller = module.get<PointController>(PointController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
