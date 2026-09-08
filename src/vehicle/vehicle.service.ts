import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { Vehicle } from './entities/vehicle.entity.js';
import {
  type Actor,
  companyScopeFilter,
  forceCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';

@Injectable()
export class VehicleService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
  ) {}

  create(createVehicleDto: CreateVehicleDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const data = forceCompanyId(createVehicleDto, scope);
    const vehicle = this.vehicleRepository.create({
      ...data,
      createdById: actor.userId,
    });
    return this.vehicleRepository.save(vehicle);
  }

  findAll(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    return this.vehicleRepository.find({
      where: companyScopeFilter<Vehicle>(scope),
    });
  }

  async findOne(id: string, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const vehicle = await this.vehicleRepository.findOneBy(
      withCompanyScopeWhere<Vehicle>({ id }, scope),
    );
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }
    return vehicle;
  }

  async update(id: string, updateVehicleDto: UpdateVehicleDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const vehicle = await this.findOne(id, actor);
    const data = forceCompanyId({ ...updateVehicleDto }, scope);
    Object.assign(vehicle, data, { updatedById: actor.userId });
    return this.vehicleRepository.save(vehicle);
  }

  async remove(id: string, actor: Actor) {
    const vehicle = await this.findOne(id, actor);
    return this.vehicleRepository.remove(vehicle);
  }
}
