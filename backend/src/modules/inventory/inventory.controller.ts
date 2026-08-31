import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant',
})
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stock')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Consultar niveles de stock por bodega' })
  @ApiResponse({ status: 200, description: 'Listado de existencias.' })
  async getStock(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getStockByTenant(user.tenantId);
  }

  @Get('movements')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE)
  @ApiOperation({ summary: 'Consultar historial de movimientos (Kardex)' })
  @ApiResponse({ status: 200, description: 'Historial de movimientos.' })
  async getMovements(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getMovements(user.tenantId);
  }

  @Post('movements')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Registrar un movimiento de stock (Entrada/Salida/Ajuste)' })
  @ApiResponse({ status: 201, description: 'Movimiento registrado y stock actualizado.' })
  async registerMovement(
    @Body() createMovementDto: CreateMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.registerMovement(
      createMovementDto,
      user.tenantId,
      user.id,
    );
  }
}
