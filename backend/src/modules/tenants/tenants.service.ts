import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll() {
    return this.prisma.tenant.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        domain: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(
    identifier: string,
    requesterTenantId?: string,
    isGlobalAdmin: boolean = false,
  ) {
    const tenant =
      await this.prisma.tenant.findFirst({
        where: {
          OR: [
            {
              id:
                identifier,
            },
            {
              code:
                identifier
                  .trim()
                  .toLowerCase(),
            },
          ],
          isActive: true,
        },
        include: {
          _count: {
            select: {
              users: true,
              products: true,
              orders: true,
              invoices: true,
              customers: true,
            },
          },
        },
      });

    if (!tenant) {
      throw new NotFoundException(
        `Empresa '${identifier}' no encontrada.`,
      );
    }

    if (
      !isGlobalAdmin &&
      tenant.id !==
        requesterTenantId
    ) {
      throw new ForbiddenException(
        'No tienes permisos para consultar información de otra empresa.',
      );
    }

    return tenant;
  }

  async create(
    createTenantDto: CreateTenantDto,
  ) {
    const normalizedCode =
      createTenantDto.code
        .trim()
        .toLowerCase();

    const existing =
      await this.prisma.tenant.findUnique({
        where: {
          code:
            normalizedCode,
        },
      });

    if (existing) {
      throw new ConflictException(
        `Ya existe una empresa con el código '${normalizedCode}'.`,
      );
    }

    return this.prisma.tenant.create({
      data: {
        code:
          normalizedCode,
        name:
          createTenantDto.name,
        rutOrTaxId:
          createTenantDto.taxId,
        email:
          createTenantDto.email,
        address:
          createTenantDto.address,
        phone:
          createTenantDto.phone,
      },
    });
  }
}