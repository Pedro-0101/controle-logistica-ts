import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.schema.js';
import { UpdateUserDto } from './dto/update-user.schema.js';
import { LinkPointsDto } from './dto/link-points.schema.js';
import { User } from './entities/user.entity.js';
import { Point } from '../point/entities/point.entity.js';
import {
  type Actor,
  companyScopeFilter,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';

const SALT_ROUNDS = 10;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Point)
    private readonly pointRepository: Repository<Point>,
  ) {}

  async create(createUserDto: CreateUserDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const companyId = scope.mode === 'company' ? scope.companyId : null;

    if (createUserDto.role === 'admin' && companyId) {
      await this.assertSingleCompanyAdmin(companyId);
    }

    const hashedPassword = await this.hashPassword(createUserDto.password);
    const user = this.userRepository.create({
      ...createUserDto,
      companyId,
      password: hashedPassword,
    });
    return this.userRepository.save(user);
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  findAll(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    return this.userRepository.find({
      where: companyScopeFilter<User>(scope),
    });
  }

  findByEmail(email: string) {
    return this.userRepository.findOneBy({ email });
  }

  async findOne(id: string, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const user = await this.userRepository.findOneBy(
      withCompanyScopeWhere<User>({ id }, scope),
    );
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, actor: Actor) {
    const user = await this.findOne(id, actor);
    const data = { ...updateUserDto };

    if (user.role === 'admin' && data.role && data.role !== 'admin') {
      throw new ForbiddenException(
        'O administrador da empresa não pode ter o papel alterado',
      );
    }

    const targetCompanyId = user.companyId;
    const targetRole = data.role ?? user.role;
    if (targetRole === 'admin' && targetCompanyId) {
      const existingAdmin = await this.userRepository.findOneBy({
        companyId: targetCompanyId,
        role: 'admin',
      });
      if (existingAdmin && existingAdmin.id !== user.id) {
        throw new ConflictException('Esta empresa já possui um administrador');
      }
    }

    if (data.password) {
      data.password = await this.hashPassword(data.password);
    }
    Object.assign(user, data);
    return this.userRepository.save(user);
  }

  async remove(id: string, actor: Actor) {
    const user = await this.findOne(id, actor);
    if (user.role === 'admin') {
      throw new ForbiddenException('Usuários administradores não podem ser removidos');
    }
    return this.userRepository.remove(user);
  }

  async linkPoints(userId: string, linkPointsDto: LinkPointsDto, actor: Actor) {
    if (actor.role === 'user') {
      throw new ForbiddenException('Usuários comuns não podem editar vinculações de pontos');
    }

    const user = await this.findOne(userId, actor);
    if (user.role !== 'user') {
      throw new ForbiddenException('Apenas usuários do tipo "user" podem ser vinculados a pontos');
    }

    const points = await this.pointRepository.findBy({ id: In(linkPointsDto.pointIds) });
    if (points.length !== linkPointsDto.pointIds.length) {
      throw new NotFoundException('Um ou mais pontos não foram encontrados');
    }

    const scope = resolveCompanyScope(actor);
    if (scope.mode === 'company') {
      const invalidPoints = points.filter((p: Point) => p.companyId !== scope.companyId);
      if (invalidPoints.length > 0) {
        throw new ForbiddenException('Um ou mais pontos não pertencem à sua empresa');
      }
    }

    user.points = [...(user.points || []), ...points];
    await this.userRepository.save(user);
    return this.findOne(userId, actor);
  }

  async unlinkPoints(userId: string, linkPointsDto: LinkPointsDto, actor: Actor) {
    if (actor.role === 'user') {
      throw new ForbiddenException('Usuários comuns não podem editar vinculações de pontos');
    }

    const user = await this.findOne(userId, actor);
    if (!user.points || user.points.length === 0) {
      return user;
    }

    user.points = user.points.filter((p: Point) => !linkPointsDto.pointIds.includes(p.id));
    await this.userRepository.save(user);
    return this.findOne(userId, actor);
  }

  async getUserPoints(userId: string, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const user = await this.userRepository.findOne({
      where: withCompanyScopeWhere<User>({ id: userId }, scope),
      relations: { points: true },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return user.points || [];
  }

  private async assertSingleCompanyAdmin(companyId: string) {
    const existingAdmin = await this.userRepository.findOneBy({
      companyId,
      role: 'admin',
    });
    if (existingAdmin) {
      throw new ConflictException('Esta empresa já possui um administrador');
    }
  }
}
