import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { AuthenticatedUser } from '../../../common/types/express';
import { Role } from '../../../common/constants/roles.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  tenantId: string;
  tenantCode?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'El usuario no existe o ha sido desactivado.',
      );
    }

    if (user.tenant && !user.tenant.isActive) {
      throw new UnauthorizedException(
        'La empresa/tenant asociada se encuentra suspendida o inactiva.',
      );
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role as Role,
      tenantId: user.tenantId,
      tenantCode: user.tenant?.code,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
