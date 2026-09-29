import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { Role } from '@prisma/client';

jest.mock('argon2', () => ({
    hash: jest.fn(),
    verify: jest.fn(),
}));

describe('AuthService security regression tests', () => {
    const argon2Mock = argon2 as unknown as {
        hash: jest.Mock;
        verify: jest.Mock;
    };

    let prisma: any;
    let jwtService: any;
    let configService: any;
    let service: AuthService;

    beforeEach(() => {
        prisma = {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        tenant: {
            findFirst: jest.fn(),
        },
        refreshToken: {
            create: jest.fn(),
            findMany: jest.fn(),
            updateMany: jest.fn(),
        },
        };

        jwtService = {
        signAsync: jest.fn(),
        verify: jest.fn(),
        };

        const values: Record<string, string | undefined> = {
        NODE_ENV: 'test',
        PUBLIC_REGISTRATION_ENABLED: 'true',
        PUBLIC_REGISTRATION_TENANT_CODE: 'induwork',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_SECRET: 'access-secret',
        JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
        };

        configService = {
        get: jest.fn((key: string) => values[key]),
        getOrThrow: jest.fn((key: string) => {
            const value = values[key];
            if (!value) {
            throw new Error(`Missing config: ${key}`);
            }
            return value;
        }),
        };

        service = new AuthService(prisma, jwtService, configService);

        argon2Mock.hash.mockResolvedValue('hashed-value');
        argon2Mock.verify.mockResolvedValue(true);
        jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
        prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-id' });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('rejects public registration in production when explicitly disabled', async () => {
        configService.get.mockImplementation((key: string) => {
        const values: Record<string, string | undefined> = {
            NODE_ENV: 'production',
            PUBLIC_REGISTRATION_ENABLED: 'false',
        };
        return values[key];
        });

        await expect(
        service.register({
            email: 'user@example.com',
            password: 'StrongPassword123!',
            firstName: 'Test',
            lastName: 'User',
        }),
        ).rejects.toThrow(ForbiddenException);

        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects public registration when no tenant code is configured', async () => {
        configService.get.mockImplementation((key: string) => {
        const values: Record<string, string | undefined> = {
            NODE_ENV: 'test',
            PUBLIC_REGISTRATION_ENABLED: 'true',
        };
        return values[key];
        });

        await expect(
        service.register({
            email: 'user@example.com',
            password: 'StrongPassword123!',
            firstName: 'Test',
            lastName: 'User',
        }),
        ).rejects.toThrow(BadRequestException);
    });

    it('rejects registration into an inactive or missing configured tenant', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.tenant.findFirst.mockResolvedValue(null);

        await expect(
        service.register({
            email: 'user@example.com',
            password: 'StrongPassword123!',
            firstName: 'Test',
            lastName: 'User',
        }),
        ).rejects.toThrow(NotFoundException);
    });

    it('forces public registrations to Role.USER even when a caller injects another role', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.tenant.findFirst.mockResolvedValue({
        id: 'tenant-1',
        code: 'induwork',
        name: 'Induwork SpA',
        isActive: true,
        });
        prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: Role.USER,
        tenantId: 'tenant-1',
        tenant: {
            id: 'tenant-1',
            code: 'induwork',
            name: 'Induwork SpA',
        },
        });

        const maliciousPayload = {
        email: 'user@example.com',
        password: 'StrongPassword123!',
        firstName: 'Test',
        lastName: 'User',
        role: Role.SYSTEM_ADMIN,
        };

        await service.register(maliciousPayload as any);

        expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
            data: expect.objectContaining({
            role: Role.USER,
            tenantId: 'tenant-1',
            }),
        }),
        );
    });

    it('rejects login when the tenant is inactive', async () => {
        prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hash',
        role: Role.USER,
        tenantId: 'tenant-1',
        isActive: true,
        tenant: {
            id: 'tenant-1',
            code: 'induwork',
            name: 'Induwork SpA',
            isActive: false,
        },
        });

        await expect(
        service.login({
            email: 'user@example.com',
            password: 'StrongPassword123!',
        }),
        ).rejects.toThrow(UnauthorizedException);

        expect(argon2Mock.verify).not.toHaveBeenCalled();
    });

    it('rejects login when the password is invalid without issuing tokens', async () => {
        prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hash',
        role: Role.USER,
        tenantId: 'tenant-1',
        isActive: true,
        tenant: {
            id: 'tenant-1',
            code: 'induwork',
            name: 'Induwork SpA',
            isActive: true,
        },
        });
        argon2Mock.verify.mockResolvedValue(false);

        await expect(
        service.login({
            email: 'user@example.com',
            password: 'WrongPassword',
        }),
        ).rejects.toThrow(UnauthorizedException);

        expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('rejects login when the user does not exist', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(
        service.login({
            email: 'missing@example.com',
            password: 'StrongPassword123!',
        }),
        ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects refresh when the stored token cannot be matched', async () => {
        prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: Role.USER,
        tenantId: 'tenant-1',
        isActive: true,
        tenant: {
            id: 'tenant-1',
            code: 'induwork',
            name: 'Induwork SpA',
            isActive: true,
        },
        });
        jwtService.verify.mockReturnValue({ sub: 'user-1' });
        prisma.refreshToken.findMany.mockResolvedValue([
        {
            id: 'stored-1',
            tokenHash: 'hash-1',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
        },
        ]);
        argon2Mock.verify.mockResolvedValue(false);

        await expect(
        service.refreshTokens({ refreshToken: 'invalid-refresh-token' }),
        ).rejects.toThrow(UnauthorizedException);

        expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rejects refresh when an already-used token loses the revocation race', async () => {
        prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: Role.USER,
        tenantId: 'tenant-1',
        isActive: true,
        tenant: {
            id: 'tenant-1',
            code: 'induwork',
            name: 'Induwork SpA',
            isActive: true,
        },
        });
        jwtService.verify.mockReturnValue({ sub: 'user-1' });
        prisma.refreshToken.findMany.mockResolvedValue([
        {
            id: 'stored-1',
            tokenHash: 'hash-1',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
        },
        ]);
        argon2Mock.verify.mockResolvedValue(true);
        prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

        await expect(
        service.refreshTokens({ refreshToken: 'refresh-token' }),
        ).rejects.toThrow(UnauthorizedException);

        expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
            where: expect.objectContaining({
            id: 'stored-1',
            userId: 'user-1',
            revokedAt: null,
            }),
        }),
        );
    });

    it('creates refresh tokens only after successful authentication', async () => {
        prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hash',
        role: Role.USER,
        tenantId: 'tenant-1',
        isActive: true,
        tenant: {
            id: 'tenant-1',
            code: 'induwork',
            name: 'Induwork SpA',
            isActive: true,
        },
        });

        const result = await service.login({
        email: 'user@example.com',
        password: 'StrongPassword123!',
        });

        expect(result.accessToken).toBe('access-token');
        expect(result.refreshToken).toBe('refresh-token');
        expect(argon2Mock.verify).toHaveBeenCalledWith(
        'hash',
        'StrongPassword123!',
        );
        expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });
});
