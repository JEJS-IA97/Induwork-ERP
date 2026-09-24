import {
  Controller,
  Get,
  Post,
  Body,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'Listar empresas disponibles',
  })
  @ApiResponse({
    status: 200,
    description:
      'Listado de empresas activas.',
  })
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':identifier')
  @Roles(Role.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Obtener detalle de la empresa del usuario',
  })
  @ApiResponse({
    status: 200,
    description:
      'Detalle de la empresa.',
  })
  async findOne(
    @Param('identifier')
    identifier: string,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    const isGlobalAdmin =
      user.role ===
      Role.SYSTEM_ADMIN;

    return this.tenantsService.findOne(
      identifier,
      user.tenantId,
      isGlobalAdmin,
    );
  }

  @Post()
  @Roles(Role.SYSTEM_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Crear nueva empresa en el ERP (Solo SYSTEM_ADMIN)',
  })
  @ApiResponse({
    status: 201,
    description:
      'Empresa creada exitosamente.',
  })
  @ApiResponse({
    status: 409,
    description:
      'El código de la empresa ya existe.',
  })
  async create(
    @Body()
    createTenantDto: CreateTenantDto,
  ) {
    return this.tenantsService.create(
      createTenantDto,
    );
  }
}