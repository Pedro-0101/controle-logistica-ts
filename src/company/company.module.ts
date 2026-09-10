import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyService } from './company.service.js';
import { CompanyController } from './company.controller.js';
import { Company } from './entities/company.entity.js';
import { UserModule } from '../user/user.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Company]), UserModule],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
