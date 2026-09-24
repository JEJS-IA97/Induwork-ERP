import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../../common/constants/roles.enum';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId?: string,
    isGlobalAdmin: boolean = false,
  ) {
    const where: any = {};

    if (!isGlobalAdmin && tenantId) {
      where.tenantId = tenantId;
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    id: string,
    tenantId?: string,
    isGlobalAdmin: boolean = false,
  ) {
    const where: any = { id };

    if (!isGlobalAdmin && tenantId) {
      where.tenantId = tenantId;
    }

    const user = await this.prisma.user.findFirst({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `Usuario con ID '${id}' no encontrado.`,
      );
    }

    return user;
  }

  async create(
    createUserDto: CreateUserDto,
    requesterTenantId: string,
    isGlobalAdmin: boolean = false,
  ) {
    const {
      email,
      password,
      firstName,
      lastName,
      role,
      tenantCode,
    } = createUserDto;

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException(
        'El correo ya está registrado en el sistema.',
      );
    }

    let tenant;

    if (isGlobalAdmin) {
      tenant = await this.prisma.tenant.findFirst({
        where: {
          OR: [
            { code: tenantCode.trim().toLowerCase() },
            { id: tenantCode },
          ],
          isActive: true,
        },
      });
    } else {
      if (!requesterTenantId) {
        throw new ForbiddenException(
          'El usuario autenticado no tiene un tenant asignado.',
        );
      }

      tenant = await this.prisma.tenant.findFirst({
        where: {
          id: requesterTenantId,
          isActive: true,
        },
      });

      if (!tenant) {
        throw new NotFoundException(
          'La empresa del usuario autenticado no existe o está inactiva.',
        );
      }

      const requestedTenantCode = tenantCode.trim().toLowerCase();

      const matchesCurrentTenant =
        requestedTenantCode === tenant.id.toLowerCase() ||
        requestedTenantCode === tenant.code.toLowerCase();

      if (!matchesCurrentTenant) {
        throw new ForbiddenException(
          'Un administrador de tenant solo puede crear usuarios dentro de su propia empresa.',
        );
      }
    }

    if (!tenant) {
      throw new NotFoundException(
        `Empresa '${tenantCode}' no encontrada.`,
      );
    }

    const passwordHash = await argon2.hash(password);

    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: role || Role.VENDEDOR,
        tenantId: tenant.id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        tenantId: true,
        createdAt: true,
      },
    });
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    tenantId?: string,
    isGlobalAdmin: boolean = false,
  ) {
    await this.findOne(
      id,
      tenantId,
      isGlobalAdmin,
    );

    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        tenantId: true,
        updatedAt: true,
      },
    });
  }

  async remove(
    id: string,
    tenantId?: string,
    isGlobalAdmin: boolean = false,
  ) {
    await this.findOne(
      id,
      tenantId,
      isGlobalAdmin,
    );

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });
  }
}