import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateCompanyConfigDto } from './dto/update-company-config.schema.js';
import { CompanyConfig } from './entities/company-config.entity.js';
import {
  type Actor,
  resolveCompanyScope,
} from '../auth/company-scope.js';

@Injectable()
export class CompanyConfigService {
  constructor(
    @InjectRepository(CompanyConfig)
    private readonly configRepository: Repository<CompanyConfig>,
  ) {}

  async createWithDefaults(companyId: string, createdById: string): Promise<CompanyConfig> {
    const config = this.configRepository.create({
      companyId,
      createdById,
    });
    return this.configRepository.save(config);
  }

  async findOne(companyId: string, actor: Actor): Promise<CompanyConfig> {
    const scope = resolveCompanyScope(actor);
    if (scope.mode === 'company' && scope.companyId !== companyId) {
      throw new NotFoundException(`Configuração não encontrada para a empresa ${companyId}`);
    }
    const config = await this.configRepository.findOneBy({ companyId });
    if (!config) {
      throw new NotFoundException(`Configuração não encontrada para a empresa ${companyId}`);
    }
    return config;
  }

  async update(companyId: string, updateDto: UpdateCompanyConfigDto, actor: Actor): Promise<CompanyConfig> {
    const config = await this.findOne(companyId, actor);
    Object.assign(config, updateDto, { updatedById: actor.userId });
    return this.configRepository.save(config);
  }
}
