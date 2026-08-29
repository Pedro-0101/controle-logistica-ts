import { Test, TestingModule } from '@nestjs/testing';
import { AdminUnityService } from './admin-unity.service.js';

describe('AdminUnityService', () => {
  let service: AdminUnityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminUnityService],
    }).compile();

    service = module.get<AdminUnityService>(AdminUnityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
