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
      return true;
    }

    if (user.role === Role.SYSTEM_ADMIN) {
      return true;
    }

    if (!user.tenantId) {
      throw new ForbiddenException(
        'El usuario autenticado no tiene un tenant asignado.',
      );
    }

    if (requestTenantId && requestTenantId !== user.tenantId) {
      throw new ForbiddenException(
        'Acceso denegado. No tienes permisos para operar en esta empresa/tenant.',
      );
    }

    return true;
  }
}
