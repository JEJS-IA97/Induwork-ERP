import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
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

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Listar empresas registradas en el ERP',
    description: 'Devuelve las empresas activas (Coimsa, Induwork, Inversiones MVI, etc.).',
  })
  @ApiResponse({ status: 200, description: 'Listado de empresas.' })
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':identifier')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Obtener detalle de una empresa',
    description: 'Busca por ID UUID o por código slug (ej. Coimsa, induwork, inversiones-mvi).',
  })
  @ApiResponse({ status: 200, description: 'Detalle de la empresa.' })
  @ApiResponse({ status: 404, description: 'Empresa no encontrada.' })
  async findOne(@Param('identifier') identifier: string) {
    return this.tenantsService.findOne(identifier);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Crear nueva empresa en el ERP (Solo ADMIN)',
    description: 'Registra un nuevo tenant en la base de datos.',
  })
  @ApiResponse({ status: 201, description: 'Empresa creada exitosamente.' })
  @ApiResponse({ status: 409, description: 'El código de la empresa ya existe.' })
  async create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantsService.create(createTenantDto);
  }
}
