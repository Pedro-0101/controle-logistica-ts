import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
      plate: normalizePlate(createVehicleDto.plate),
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

  async findOrCreateByPlate(plate: string, companyId: string, actor: Actor, manager?: EntityManager) {
    if (!companyId || (actor.companyId && actor.companyId !== companyId)) {
      throw new ForbiddenException('Veículo deve pertencer à empresa da operação');
    }
    plate = normalizePlate(plate);
    const repository = manager ? manager.getRepository(Vehicle) : this.vehicleRepository;
    const existing = await repository.findOneBy({ plate, companyId });
    if (existing) {
      return existing;
    }
    await repository.upsert(
      {
        plate,
        code: plate,
        type: 'visitor',
        active: true,
        companyId,
        createdById: actor.userId,
      },
      {
        conflictPaths: ['companyId', 'plate'],
        skipUpdateIfNoValuesChanged: true,
      },
    );
    const vehicle = await repository.findOneBy({ plate, companyId });
    if (!vehicle) throw new ConflictException('Veículo não pôde ser criado; tente novamente');
    return vehicle;
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
    Object.assign(vehicle, updateVehicleDto, {
      ...(updateVehicleDto.plate !== undefined ? { plate: normalizePlate(updateVehicleDto.plate) } : {}),
      updatedById: actor.userId,
    });
    return this.vehicleRepository.save(vehicle);
  }

  async remove(id: string, actor: Actor) {
    const vehicle = await this.findOne(id, actor);
    return this.vehicleRepository.remove(vehicle);
  }
}

/** Canonicalize spelling only. Never guess OCR substitutions for user input. */
export function normalizePlate(value: string): string {
  const plate = value.trim().toUpperCase();
  if (!/^[A-Z]{3}-?\d{4}$/.test(plate) && !/^[A-Z]{3}\d[A-Z]\d{2}$/.test(plate)) {
    throw new BadRequestException('Placa inválida: informe ABC1234 ou ABC1D23');
  }
  return plate.replace('-', '');
}
