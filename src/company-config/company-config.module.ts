import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyConfigService } from './company-config.service.js';
import { CompanyConfigController } from './company-config.controller.js';
import { CompanyConfig } from './entities/company-config.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyConfig])],
  controllers: [CompanyConfigController],
  providers: [CompanyConfigService],
  exports: [CompanyConfigService],
})
export class CompanyConfigModule {}
