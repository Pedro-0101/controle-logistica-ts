import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.schema.js';
import { UpdateUserDto } from './dto/update-user.schema.js';
import { User } from './entities/user.entity.js';

const SALT_ROUNDS = 10;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, SALT_ROUNDS);
    const user = this.userRepository.create({
      ...createUserDto,
      companyId: createUserDto.companyId ?? null,
      password: hashedPassword,
    });
    return this.userRepository.save(user);
  }

  findAll() {
    return this.userRepository.find();
  }

  findByEmail(email: string) {
    return this.userRepository.findOneBy({ email });
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);
    const data = { ...updateUserDto };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, SALT_ROUNDS);
    }
    Object.assign(user, data);
    return this.userRepository.save(user);
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    return this.userRepository.remove(user);
  }
}
