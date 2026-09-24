import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Role } from '../../common/constants/roles.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas (email o contraseña incorrectos).');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('La cuenta de usuario se encuentra desactivada.');
    }

    if (user.tenant && !user.tenant.isActive) {
      throw new UnauthorizedException('La empresa/tenant asociada se encuentra inactiva.');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas (email o contraseña incorrectos).');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role as Role, user.tenantId, user.tenant?.code);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant
          ? {
              id: user.tenant.id,
              code: user.tenant.code,
              name: user.tenant.name,
            }
          : null,
      },
      ...tokens,
    };
  }

  async register(registerDto: RegisterDto, defaultTenantId?: string) {
    const { email, password, firstName, lastName } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya se encuentra registrado.');
    }

        const publicRegistrationTenantCode =
      this.configService.get<string>('PUBLIC_REGISTRATION_TENANT_CODE');

    if (!publicRegistrationTenantCode) {
      throw new BadRequestException(
        'El registro público no está configurado.',
      );
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        code: publicRegistrationTenantCode.trim().toLowerCase(),
        isActive: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'El tenant configurado para registro público no existe o está inactivo.',
      );
    }

    const tenantIdToAssign = tenant.id;

    const passwordHash = await argon2.hash(password);

    const newUser = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: Role.USER,
        tenantId: tenantIdToAssign,
      },
      include: {
        tenant: true,
      },
    });

    const tokens = await this.generateTokens(
      newUser.id,
      newUser.email,
      newUser.role as Role,
      newUser.tenantId,
      newUser.tenant?.code,
    );

    return {
      message: 'Usuario registrado exitosamente',
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        tenantId: newUser.tenantId,
        tenantName: newUser.tenant?.name,
      },
      ...tokens,
    };
  }

    async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    const { refreshToken } = refreshTokenDto;

    let payload: { sub?: string };

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token expirado o inválido.');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no válido o inactivo.');
    }

    if (user.tenant && !user.tenant.isActive) {
      throw new UnauthorizedException(
        'La empresa/tenant asociada se encuentra inactiva.',
      );
    }

    const now = new Date();

    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });

    let matchedTokenId: string | null = null;

    for (const storedToken of activeTokens) {
      if (await argon2.verify(storedToken.tokenHash, refreshToken)) {
        matchedTokenId = storedToken.id;
        break;
      }
    }

    if (!matchedTokenId) {
      throw new UnauthorizedException(
        'Refresh token revocado, expirado o inválido.',
      );
    }

    const revoked = await this.prisma.refreshToken.updateMany({
      where: {
        id: matchedTokenId,
        userId: user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    if (revoked.count !== 1) {
      throw new UnauthorizedException(
        'El refresh token ya fue utilizado o revocado.',
      );
    }

    return this.generateTokens(
      user.id,
      user.email,
      user.role as Role,
      user.tenantId,
      user.tenant?.code,
    );
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { message: 'Sesión cerrada correctamente.' };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: Role,
    tenantId: string,
    tenantCode?: string,
  ) {
    const payload = {
      sub: userId,
      email,
      role,
      tenantId,
      tenantCode,
    };

    const accessTokenSecret =
      this.configService.getOrThrow<string>('JWT_SECRET');

    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') || '15m';

    const refreshTokenSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    const refreshTokenExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessTokenSecret,
        expiresIn: accessTokenExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshTokenSecret,
        expiresIn: refreshTokenExpiresIn,
      }),
    ]);

    // Store hashed refresh token in database
    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenExpiresIn,
    };
  }
}
