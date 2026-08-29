import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AdminUnityService } from './admin-unity.service.js';
import { CreateAdminUnityDto } from './dto/create-admin-unity.dto.js';
import { UpdateAdminUnityDto } from './dto/update-admin-unity.dto.js';

@Controller('admin-unity')
export class AdminUnityController {
  constructor(private readonly adminUnityService: AdminUnityService) {}

  @Post()
  create(@Body() createAdminUnityDto: CreateAdminUnityDto) {
    return this.adminUnityService.create(createAdminUnityDto);
  }

  @Get()
  findAll() {
    return this.adminUnityService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminUnityService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAdminUnityDto: UpdateAdminUnityDto) {
    return this.adminUnityService.update(+id, updateAdminUnityDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminUnityService.remove(+id);
  }
}
