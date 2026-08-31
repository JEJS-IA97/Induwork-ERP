import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión en el ERP',
    description:
      'Autentica a un usuario y genera un Access Token JWT (15 min) y un Refresh Token seguro (7 días).',
  })
  @ApiResponse({
    status: 200,
    description: 'Autenticación exitosa y tokens emitidos.',
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas o cuenta inactiva.',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar un nuevo usuario',
    description:
      'Crea una nueva cuenta de usuario asignada a una empresa (Coimsa, Induwork, Inversiones MVI).',
  })
  @ApiHeader({
    name: TENANT_HEADER,
    required: false,
    description: 'Código o ID del tenant si no se envía en el cuerpo',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente.',
  })
  @ApiResponse({
    status: 409,
    description: 'El correo electrónico ya existe.',
  })
  async register(
    @Body() registerDto: RegisterDto,
    @CurrentTenant('id') tenantId?: string,
  ) {
    return this.authService.register(registerDto, tenantId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar Access Token con Refresh Token',
    description: 'Genera un nuevo par de tokens utilizando un Refresh Token válido.',
  })
  @ApiResponse({
    status: 200,
    description: 'Nuevos tokens emitidos.',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token inválido o expirado.',
  })
  async refreshTokens(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Cerrar sesión',
    description: 'Revoca todos los refresh tokens activos del usuario.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión cerrada correctamente.',
  })
  async logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Obtener perfil del usuario autenticado',
    description: 'Retorna los datos del usuario en sesión, su rol y empresa asignada.',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos del usuario autenticado.',
  })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return {
      user,
    };
  }
}
