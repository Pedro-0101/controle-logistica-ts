import { PartialType } from '@nestjs/mapped-types';
import { CreateAdminUnityDto } from './create-admin-unity.dto.js';

export class UpdateAdminUnityDto extends PartialType(CreateAdminUnityDto) {}
