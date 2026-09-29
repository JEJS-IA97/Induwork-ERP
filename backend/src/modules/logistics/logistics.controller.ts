import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { DispatchGuideService } from './services/dispatch-guide.service';
import { StockTransfersService } from './services/stock-transfers.service';
import { CreateDispatchGuideDto } from './dto/create-dispatch-guide.dto';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Logistics')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant (coimsa | induwork | inversiones-mvi)',
})
@Controller('logistics')
export class LogisticsController {
  constructor(
    private readonly dispatchGuideService: DispatchGuideService,
    private readonly stockTransfersService: StockTransfersService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // GUÍAS DE DESPACHO (DTE 52)
  // ────────────────────────────────────────────────────────────────────────────

  @Post('dispatch-guides')
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Crear Guía de Despacho (DTE 52)',
    description:
      'Genera una Guía de Despacho con numeración correlativa GD-YYYY-NNNNN. ' +
      'Si el tipo es VENTA o TRASLADO, descuenta el stock automáticamente y registra en el Kardex. ' +
      'La guía queda en estado DRAFT hasta ser emitida formalmente.',
  })
  @ApiResponse({ status: 201, description: 'Guía de despacho creada en estado DRAFT.' })
  async createDispatchGuide(
    @Body() dto: CreateDispatchGuideDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatchGuideService.create(dto, user.tenantId, user.id);
  }

  @Get('dispatch-guides')
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Listar guías de despacho del tenant' })
  async findAllDispatchGuides(@CurrentUser() user: AuthenticatedUser) {
    return this.dispatchGuideService.findAll(user.tenantId);
  }

  @Get('dispatch-guides/:id')
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Detalle de una guía de despacho con ítems y movimientos' })
  @ApiParam({ name: 'id', description: 'ID de la guía de despacho' })
  async findOneDispatchGuide(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatchGuideService.findOne(id, user.tenantId);
  }

  @Patch('dispatch-guides/:id/issue')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Emitir guía de despacho (DRAFT → ISSUED)',
    description:
      'Marca la guía como emitida formalmente. ' +
      'Solo guías en estado DRAFT pueden ser emitidas.',
  })
  @ApiParam({ name: 'id', description: 'ID de la guía de despacho' })
  @ApiResponse({ status: 200, description: 'Guía emitida.' })
  async issueDispatchGuide(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatchGuideService.issue(id, user.tenantId);
  }

  @Patch('dispatch-guides/:id/cancel')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Anular guía de despacho',
    description: 'Cancela una guía en estado DRAFT o ISSUED. No se puede anular una guía DELIVERED.',
  })
  @ApiParam({ name: 'id', description: 'ID de la guía de despacho' })
  async cancelDispatchGuide(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatchGuideService.cancel(id, user.tenantId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // TRANSFERENCIAS ENTRE BODEGAS
  // ────────────────────────────────────────────────────────────────────────────

  @Post('stock-transfers')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Crear transferencia entre bodegas (DRAFT)',
    description:
      'Registra el plan de traslado de stock de una bodega a otra. ' +
      'La transferencia queda en DRAFT hasta ser ejecutada con el endpoint /execute.',
  })
  @ApiResponse({ status: 201, description: 'Transferencia creada en estado DRAFT.' })
  async createStockTransfer(
    @Body() dto: CreateStockTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockTransfersService.create(dto, user.tenantId, user.id);
  }

  @Get('stock-transfers')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Listar transferencias de stock del tenant' })
  async findAllTransfers(@CurrentUser() user: AuthenticatedUser) {
    return this.stockTransfersService.findAll(user.tenantId);
  }

  @Get('stock-transfers/:id')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Detalle de una transferencia de stock con ítems' })
  @ApiParam({ name: 'id', description: 'ID de la transferencia' })
  async findOneTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockTransfersService.findOne(id, user.tenantId);
  }

  @Patch('stock-transfers/:id/execute')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Ejecutar transferencia de stock (DRAFT → COMPLETED)',
    description:
      'Ejecuta el movimiento de stock de forma atómica: descuenta en bodega origen, ' +
      'agrega en bodega destino y registra los movimientos OUT/IN en el Kardex. ' +
      'Falla con error 400 si no hay stock suficiente en origen.',
  })
  @ApiParam({ name: 'id', description: 'ID de la transferencia' })
  @ApiResponse({ status: 200, description: 'Transferencia ejecutada y stock actualizado.' })
  async executeTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockTransfersService.execute(id, user.tenantId, user.id);
  }

  @Patch('stock-transfers/:id/cancel')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Cancelar transferencia de stock',
    description: 'Solo se pueden cancelar transferencias en estado DRAFT.',
  })
  @ApiParam({ name: 'id', description: 'ID de la transferencia' })
  async cancelTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockTransfersService.cancel(id, user.tenantId);
  }
}
