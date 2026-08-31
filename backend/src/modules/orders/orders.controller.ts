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
  ApiHeader,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant',
})
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Listar órdenes comerciales de la empresa' })
  @ApiResponse({ status: 200, description: 'Listado de órdenes.' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findAll(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Obtener detalle de una orden' })
  @ApiResponse({ status: 200, description: 'Detalle de la orden.' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Crear una nueva orden de venta' })
  @ApiResponse({ status: 201, description: 'Orden creada exitosamente.' })
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.create(createOrderDto, user.tenantId);
  }
}
