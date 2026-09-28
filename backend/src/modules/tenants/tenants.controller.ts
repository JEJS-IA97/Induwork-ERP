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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';

@ApiTags('Tenants')
@ApiBearerAuth('access-token')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
  ) {}

  @Get()
  @Roles(Role.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'Listar todas las empresas activas (Solo SYSTEM_ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Listado de empresas activas.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Solo SYSTEM_ADMIN puede consultar el listado global de empresas.',
  })
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':identifier')
  @Roles(Role.ADMIN)
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