import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { Vehicle } from './entities/vehicle.entity.js';
import {
  type Actor,
  companyScopeFilter,
  requireCompanyId,
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
    const companyId = requireCompanyId(actor);
    const vehicle = this.vehicleRepository.create({
      ...createVehicleDto,
      companyId,
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

  async findOrCreateByPlate(plate: string, companyId: string, actor: Actor) {
    const existing = await this.vehicleRepository.findOneBy({ plate });
    if (existing) {
      return existing;
    }
    const vehicle = this.vehicleRepository.create({
      plate,
      code: plate,
      type: 'visitor',
      active: true,
      companyId,
      createdById: actor.userId,
    });
    return this.vehicleRepository.save(vehicle);
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
    const vehicle = await this.findOne(id, actor);
    Object.assign(vehicle, updateVehicleDto, { updatedById: actor.userId });
    return this.vehicleRepository.save(vehicle);
  }

  async remove(id: string, actor: Actor) {
    const vehicle = await this.findOne(id, actor);
    return this.vehicleRepository.remove(vehicle);
  }
}
