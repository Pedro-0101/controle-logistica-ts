import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.schema.js';
import { UpdateUserDto } from './dto/update-user.schema.js';
import { User } from './entities/user.entity.js';
import {
  type Actor,
  companyScopeFilter,
  forceCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';

const SALT_ROUNDS = 10;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const data = forceCompanyId(createUserDto, scope);
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
    const user = this.userRepository.create({
      ...data,
      companyId: data.companyId ?? null,
      password: hashedPassword,
    });
    return this.userRepository.save(user);
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
    const scope = resolveCompanyScope(actor);
    const user = await this.findOne(id, actor);
    const data = forceCompanyId({ ...updateUserDto }, scope);
    if (data.password) {
      data.password = await bcrypt.hash(data.password, SALT_ROUNDS);
    }
    Object.assign(user, data);
    return this.userRepository.save(user);
  }

  async remove(id: string, actor: Actor) {
    const user = await this.findOne(id, actor);
    return this.userRepository.remove(user);
  }
}
