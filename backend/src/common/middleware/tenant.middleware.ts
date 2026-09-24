import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TENANT_HEADER } from '../constants/tenants.constant';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const rawTenantHeader = req.headers[TENANT_HEADER] || req.headers['x-company-id'];
    const tenantIdentifier = Array.isArray(rawTenantHeader)
      ? rawTenantHeader[0]
      : rawTenantHeader;

    if (tenantIdentifier) {
      const normalizedCode = tenantIdentifier.trim().toLowerCase();

      try {
        // Find tenant by UUID id or code (e.g. 'Coimsa', 'induwork', 'inversiones-mvi')
        const tenant = await this.prisma.tenant.findFirst({
          where: {
            OR: [
              { id: tenantIdentifier },
              { code: normalizedCode },
            ],
            isActive: true,
          },
        });

        if (!tenant) {
          throw new BadRequestException(
            'El tenant indicado no existe o está inactivo.',
          );
        }

        req.tenantId = tenant.id;
        req.tenantCode = tenant.code;
            } catch (error) {
        throw new BadRequestException(
          'No fue posible validar el tenant solicitado.',
        );
      }
    }

    next();
  }
}
