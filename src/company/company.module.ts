import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyService } from './company.service.js';
import { CompanyController } from './company.controller.js';
import { Company } from './entities/company.entity.js';
import { UserModule } from '../user/user.module.js';
import { CompanyConfigModule } from '../company-config/company-config.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Company]), UserModule, CompanyConfigModule],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
