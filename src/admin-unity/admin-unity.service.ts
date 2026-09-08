import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAdminUnityDto } from './dto/create-admin-unity.dto.js';
import { UpdateAdminUnityDto } from './dto/update-admin-unity.dto.js';
import { AdminUnity } from './entities/admin-unity.entity.js';
import {
  type Actor,
  companyScopeFilter,
  forceCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';

@Injectable()
export class AdminUnityService {
  constructor(
    @InjectRepository(AdminUnity)
    private readonly adminUnityRepository: Repository<AdminUnity>,
  ) {}

  create(createAdminUnityDto: CreateAdminUnityDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const data = forceCompanyId(createAdminUnityDto, scope);
    const adminUnity = this.adminUnityRepository.create(data);
    return this.adminUnityRepository.save(adminUnity);
  }

  findAll(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    return this.adminUnityRepository.find({
      where: companyScopeFilter<AdminUnity>(scope),
    });
  }

  async findOne(id: string, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const adminUnity = await this.adminUnityRepository.findOneBy(
      withCompanyScopeWhere<AdminUnity>({ id }, scope),
    );
    if (!adminUnity) {
      throw new NotFoundException(`AdminUnity with ID ${id} not found`);
    }
    return adminUnity;
  }

  async update(
    id: string,
    updateAdminUnityDto: UpdateAdminUnityDto,
    actor: Actor,
  ) {
    const scope = resolveCompanyScope(actor);
    const adminUnity = await this.findOne(id, actor);
    const data = forceCompanyId({ ...updateAdminUnityDto }, scope);
    Object.assign(adminUnity, data);
    return this.adminUnityRepository.save(adminUnity);
  }

  async remove(id: string, actor: Actor) {
    const adminUnity = await this.findOne(id, actor);
    return this.adminUnityRepository.remove(adminUnity);
  }
}
