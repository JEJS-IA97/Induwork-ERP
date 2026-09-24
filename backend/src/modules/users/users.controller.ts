import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Filtrar usuarios por ID o código de empresa',
})
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Listar usuarios (filtrados por la empresa del usuario)',
  })
  @ApiResponse({ status: 200, description: 'Lista de usuarios.' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    const isGlobalAdmin = user.role === Role.SYSTEM_ADMIN;

    return this.usersService.findAll(
      user.tenantId,
      isGlobalAdmin,
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isGlobalAdmin = user.role === Role.SYSTEM_ADMIN;

    return this.usersService.findOne(
      id,
      user.tenantId,
      isGlobalAdmin,
    );
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Crear nuevo usuario en la empresa (Solo ADMIN)',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado exitosamente.',
  })
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isGlobalAdmin = user.role === Role.SYSTEM_ADMIN;

    return this.usersService.create(
      createUserDto,
      user.tenantId,
      isGlobalAdmin,
    );
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar datos de usuario (Solo ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario actualizado.',
  })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isGlobalAdmin = user.role === Role.SYSTEM_ADMIN;

    return this.usersService.update(
      id,
      updateUserDto,
      user.tenantId,
      isGlobalAdmin,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Desactivar usuario (Solo ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario desactivado.',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isGlobalAdmin = user.role === Role.SYSTEM_ADMIN;

    return this.usersService.remove(
      id,
      user.tenantId,
      isGlobalAdmin,
    );
  }
}