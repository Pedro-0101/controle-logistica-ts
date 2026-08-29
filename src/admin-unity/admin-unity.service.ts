import { Injectable } from '@nestjs/common';
import { CreateAdminUnityDto } from './dto/create-admin-unity.dto.js';
import { UpdateAdminUnityDto } from './dto/update-admin-unity.dto.js';

@Injectable()
export class AdminUnityService {
  create(createAdminUnityDto: CreateAdminUnityDto) {
    return 'This action adds a new adminUnity';
  }

  findAll() {
    return `This action returns all adminUnity`;
  }

  findOne(id: number) {
    return `This action returns a #${id} adminUnity`;
  }

  update(id: number, updateAdminUnityDto: UpdateAdminUnityDto) {
    return `This action updates a #${id} adminUnity`;
  }

  remove(id: number) {
    return `This action removes a #${id} adminUnity`;
  }
}
