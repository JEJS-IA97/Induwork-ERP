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
    const { email, password, firstName, lastName, role, tenantCode } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya se encuentra registrado.');
    }

    // Resolve tenant ID
    let tenantIdToAssign = defaultTenantId;

    if (tenantCode) {
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          OR: [{ code: tenantCode.toLowerCase() }, { id: tenantCode }],
          isActive: true,
        },
      });

      if (!tenant) {
        throw new NotFoundException(`La empresa '${tenantCode}' no existe o no está activa.`);
      }
      tenantIdToAssign = tenant.id;
    }

    if (!tenantIdToAssign) {
      // Default to the first available active tenant if none provided
      const defaultTenant = await this.prisma.tenant.findFirst({
        where: { isActive: true },
      });

      if (!defaultTenant) {
        throw new BadRequestException('No hay empresas registradas en el sistema.');
      }
      tenantIdToAssign = defaultTenant.id;
    }

    const passwordHash = await argon2.hash(password);

    const newUser = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: (role as Role) || Role.VENDEDOR,
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

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ||
          'induwork_super_secret_jwt_refresh_key_2026_change_in_production',
      });
    } catch (e) {
      throw new UnauthorizedException('Refresh token expirado o inválido.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no válido o inactivo.');
    }

    // Invalidate old refresh tokens for this user and create a new set
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lt: new Date() },
      },
    });

    return this.generateTokens(user.id, user.email, user.role as Role, user.tenantId, user.tenant?.code);
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
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
      this.configService.get<string>('JWT_SECRET') ||
      'induwork_super_secret_jwt_access_key_2026_change_in_production';
    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') || '15m';

    const refreshTokenSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'induwork_super_secret_jwt_refresh_key_2026_change_in_production';
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
