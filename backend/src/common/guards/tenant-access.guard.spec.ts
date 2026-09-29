import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TenantAccessGuard } from './tenant-access.guard';

describe('TenantAccessGuard', () => {
    const guard = new TenantAccessGuard();

    const createContext = (
        user: any,
        requestTenantId?: string,
    ): ExecutionContext =>
        ({
        switchToHttp: () => ({
            getRequest: () => ({ user, tenantId: requestTenantId }),
        }),
        }) as ExecutionContext;

    it('allows requests without an authenticated user so public routes are not blocked here', () => {
        expect(guard.canActivate(createContext(undefined, 'tenant-a'))).toBe(true);
    });

    it('allows SYSTEM_ADMIN to operate across tenants', () => {
        expect(
        guard.canActivate(
            createContext(
            { role: Role.SYSTEM_ADMIN, tenantId: 'tenant-a' },
            'tenant-b',
            ),
        ),
        ).toBe(true);
    });

    it('allows a regular user when the request tenant matches the user tenant', () => {
        expect(
        guard.canActivate(
            createContext(
            { role: Role.ADMIN, tenantId: 'tenant-a' },
            'tenant-a',
            ),
        ),
        ).toBe(true);
    });

    it('rejects a regular user attempting to operate on another tenant', () => {
        expect(() =>
        guard.canActivate(
            createContext(
            { role: Role.ADMIN, tenantId: 'tenant-a' },
            'tenant-b',
            ),
        ),
        ).toThrow(ForbiddenException);
    });

    it('rejects authenticated users without a tenant assignment', () => {
        expect(() =>
        guard.canActivate(
            createContext({ role: Role.ADMIN }, 'tenant-a'),
        ),
        ).toThrow(ForbiddenException);
    });
});
