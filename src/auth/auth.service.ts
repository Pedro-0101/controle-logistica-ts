import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { CompanyService } from '../company/company.service.js';
import type { CompanySummaryDtoType } from '../company/dto/company-summary.schema.js';
import { User } from '../user/entities/user.entity.js';
import { UserService } from '../user/user.service.js';
import type { AuthenticatedUser, JwtPayload } from './strategies/jwt.strategy.js';

export type SafeUser = Omit<User, 'password'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly companyService: CompanyService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<SafeUser | null> {
    const user = await this.userService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: SafeUser) {
    const payload: JwtPayload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };
    const company = await this.findCompanySummary(user.companyId);
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
      company,
    };
  }

  async me(user: AuthenticatedUser) {
    const company = await this.findCompanySummary(user.companyId);
    return { ...user, company };
  }

  getClaimsFromToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }

  private async findCompanySummary(
    companyId: string | null,
  ): Promise<CompanySummaryDtoType | null> {
    if (!companyId) {
      return null;
    }
    const company = await this.companyService.findById(companyId);
    if (!company) {
      return null;
    }
    return {
      id: company.id,
      name: company.name,
      companyName: company.companyName,
      cnpj: company.cnpj,
      stateRegistration: company.stateRegistration,
      address: company.address,
      email: company.email,
      active: company.active,
    };
  }
}
