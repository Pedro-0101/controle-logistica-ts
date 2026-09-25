import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CreateVehicleDto } from './dto/create-vehicle.schema.js';
import { UpdateVehicleDto } from './dto/update-vehicle.schema.js';
import { Vehicle } from './entities/vehicle.entity.js';
import { normalizePlate } from '../common/plate.js';
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

  async create(createVehicleDto: CreateVehicleDto, actor: Actor) {
    const companyId = requireCompanyId(actor);
    const type = createVehicleDto.type ?? 'own';
    const code =
      type === 'own'
        ? createVehicleDto.code?.trim()
        : await this.generateCode(type, companyId, this.vehicleRepository);
    if (!code) {
      throw new BadRequestException('Código é obrigatório para veículos próprios');
    }
    const vehicle = this.vehicleRepository.create({
      ...createVehicleDto,
      type,
      code,
      plate: normalizePlate(createVehicleDto.plate),
      companyId,
      createdById: actor.userId,
    });
    return this.vehicleRepository.save(vehicle);
  }

  private async generateCode(
    type: string,
    companyId: string,
    repository: Repository<Vehicle>,
  ): Promise<string> {
    const prefix = AUTO_CODE_PREFIX[type];
    if (!prefix) {
      throw new BadRequestException('Código é obrigatório para veículos próprios');
    }
    // Reserva o próximo número de forma atômica. O contador só cresce, então
    // códigos nunca são reaproveitados mesmo após remoção de veículos.
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const rows: Array<{ lastValue: number | string }> = await repository.query(
        RESERVE_CODE_SQL,
        [companyId, type],
      );
      const code = formatVehicleCode(prefix, Number(rows[0].lastValue));
      if (!(await repository.existsBy({ companyId, code }))) {
        return code;
      }
    }
    throw new ConflictException('Não foi possível gerar um código único; tente novamente');
  }

  findAll(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    return this.vehicleRepository.find({
      where: companyScopeFilter<Vehicle>(scope),
    });
  }

  async findByPlate(plate: string, companyId: string): Promise<Vehicle | null> {
    plate = normalizePlate(plate);
    return this.vehicleRepository.findOneBy({ plate, companyId });
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
    const code = await this.generateCode('visitor', companyId, repository);
    await repository.createQueryBuilder().insert().into(Vehicle).values({
      plate,
      code,
      type: 'visitor',
      active: true,
      companyId,
      createdById: actor.userId,
    }).orIgnore().execute();
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

const AUTO_CODE_PREFIX: Record<string, string> = {
  thirdParty: 'TER',
  visitor: 'VIS',
};

const MAX_CODE_ATTEMPTS = 1000;

/**
 * Reserva atomicamente o próximo número da sequência (empresa, tipo).
 * Na primeira emissão, semeia o contador a partir do maior código já existente
 * para não colidir com veículos criados antes da sequência existir.
 * O contador persistido só incrementa, evitando reuso de códigos.
 */
const RESERVE_CODE_SQL = `
  INSERT INTO "vehicle_code_sequences" ("companyId", "type", "lastValue")
  VALUES (
    $1,
    $2::varchar,
    COALESCE((
      SELECT MAX(CAST(SUBSTRING(v."code" FROM 4) AS INTEGER))
      FROM "vehicles" v
      WHERE v."companyId" = $1
        AND v."type" = $2::varchar
        AND v."code" ~ '^(TER|VIS)[0-9]+$'
    ), 0) + 1
  )
  ON CONFLICT ("companyId", "type")
  DO UPDATE SET "lastValue" = "vehicle_code_sequences"."lastValue" + 1
  RETURNING "lastValue"
`;

/** Código sequencial no formato TER00N (terceiro) ou VIS00N (visitante). */
export function formatVehicleCode(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(3, '0')}`;
}
