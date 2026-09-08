import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { Company } from './entities/company.entity.js';
import { User } from '../user/entities/user.entity.js';
import { UserService } from '../user/user.service.js';
import { type Actor, resolveCompanyScope } from '../auth/company-scope.js';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
  ) {}

  async create(createCompanyDto: CreateCompanyDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    if (scope.mode !== 'all') {
      throw new ForbiddenException(
        'Somente o usuário root pode criar empresas',
      );
    }

    const { admin, ...companyData } = createCompanyDto;

    return this.dataSource.transaction(async (manager) => {
      const company = await manager.save(
        manager.create(Company, {
          ...companyData,
          createdById: actor.userId,
        }),
      );

      const hashedPassword = await this.userService.hashPassword(admin.password);
      const adminUser = await manager.save(
        manager.create(User, {
          name: admin.name,
          email: admin.email,
          password: hashedPassword,
          role: 'admin',
          companyId: company.id,
        }),
      );

      const { password: _password, ...safeAdmin } = adminUser;
      return { company, admin: safeAdmin };
    });
  }

  findAll(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    if (scope.mode === 'company') {
      return this.companyRepository.find({
        where: { id: scope.companyId },
      });
    }
    return this.companyRepository.find();
  }

  async findOne(id: string, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    if (scope.mode === 'company' && scope.companyId !== id) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    const where: FindOptionsWhere<Company> = { id };
    const company = await this.companyRepository.findOneBy(where);
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, actor: Actor) {
    const company = await this.findOne(id, actor);
    Object.assign(company, updateCompanyDto, { updatedById: actor.userId });
    return this.companyRepository.save(company);
  }

  async remove(id: string, actor: Actor) {
    const company = await this.findOne(id, actor);
    return this.companyRepository.remove(company);
  }
}
