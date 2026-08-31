import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '../constants/roles.enum';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const requestTenantId = request.tenantId;

    if (!user) {
      return true; // Defer to JwtAuthGuard if not authenticated
    }

    // System Admins can access all tenants if authorized
    if (user.role === Role.ADMIN) {
      return true;
    }

    // If a specific tenant header was sent, verify the user belongs to that tenant
    if (requestTenantId && user.tenantId && requestTenantId !== user.tenantId) {
      throw new ForbiddenException(
        'Acceso denegado. No tienes permisos para operar en esta empresa/tenant.',
      );
    }

    return true;
  }
}
