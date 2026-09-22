import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PurchaseOrdersService } from './services/purchase-orders.service';
import { GoodsReceiptsService } from './services/goods-receipts.service';
import { ThreeWayMatchingService } from './services/three-way-matching.service';
import { ReorderingService } from './services/reordering.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { CreateVendorBillDto } from './dto/create-vendor-bill.dto';
import {
  CreateReorderingRuleDto,
  CreateVendorPriceDto,
} from './dto/reordering-rule.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';
import { PurchaseOrderStatus } from '@prisma/client';

@ApiTags('Purchases')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant (coimsa | induwork | inversiones-mvi)',
})
@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly goodsReceiptsService: GoodsReceiptsService,
    private readonly threeWayMatchingService: ThreeWayMatchingService,
    private readonly reorderingService: ReorderingService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // ÓRDENES DE COMPRA (Purchase Orders / RFQ)
  // ────────────────────────────────────────────────────────────────────────────

  @Post('orders')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Crear Solicitud de Cotización (RFQ) o Orden de Compra (OC)',
    description:
      'Inicia el ciclo de compra: RFQ al proveedor con ítems, cantidades y costos unitarios. ' +
      'Genera numeración correlativa OC-YYYY-NNNN.',
  })
  @ApiResponse({ status: 201, description: 'Orden de Compra creada.' })
  async createOrder(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.create(dto, user.tenantId, user.id);
  }

  @Get('orders')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Listar todas las Órdenes de Compra del tenant' })
  async findAllOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.purchaseOrdersService.findAll(user.tenantId);
  }

  @Get('orders/:id')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Detalle de Orden de Compra con ítems, recepciones y facturas' })
  @ApiParam({ name: 'id', description: 'ID de la Orden de Compra' })
  async findOneOrder(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.findOne(id, user.tenantId);
  }

  @Patch('orders/:id/status')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Actualizar estado de una Orden de Compra',
    description:
      'Permite mover entre estados: RFQ → SENT → CONFIRMED → PARTIALLY_RECEIVED → RECEIVED | CANCELLED',
  })
  @ApiParam({ name: 'id', description: 'ID de la Orden de Compra' })
  async updateOrderStatus(
    @Param('id') id: string,
    @Body('status') status: PurchaseOrderStatus,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.updateStatus(
      id,
      status,
      user.tenantId,
      user.id,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RECEPCIÓN DE MERCADERÍA (Goods Receipts)
  // ────────────────────────────────────────────────────────────────────────────

  @Post('receipts')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Registrar Recepción de Mercadería en Bodega',
    description:
      'Valida y registra la entrada física de mercadería. ' +
      'Actualiza automáticamente el stock en InventoryStock y registra movimientos en el Kardex. ' +
      'Si el ítem tiene Número de Serie/Lote, lo registra en ProductLotSerial. ' +
      'Si está vinculado a una OC, actualiza las cantidades recibidas y el estado de la OC.',
  })
  @ApiResponse({ status: 201, description: 'Recepción validada y stock actualizado.' })
  async createReceipt(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.goodsReceiptsService.create(dto, user.tenantId, user.id);
  }

  @Get('receipts')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Listar recepciones de mercadería' })
  async findAllReceipts(@CurrentUser() user: AuthenticatedUser) {
    return this.goodsReceiptsService.findAll(user.tenantId);
  }

  @Get('receipts/:id')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Detalle de recepción de bodega con ítems y lotes' })
  async findOneReceipt(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.goodsReceiptsService.findOne(id, user.tenantId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FACTURAS DE PROVEEDOR + 3-WAY MATCHING
  // ────────────────────────────────────────────────────────────────────────────

  @Post('vendor-bills')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Registrar Factura de Proveedor y ejecutar validación 3-Way Matching',
    description:
      'Registra la factura recibida del proveedor y compara automáticamente contra la ' +
      'Orden de Compra (precios y totales) y la Recepción de Bodega (cantidades). ' +
      'Resultado: MATCHED (conforme), DISCREPANCY (requiere revisión) o NOT_MATCHED (sin referencias).',
  })
  @ApiResponse({
    status: 201,
    description: 'Factura registrada con resultado de 3-Way Matching.',
  })
  async createVendorBill(
    @Body() dto: CreateVendorBillDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.threeWayMatchingService.createAndValidateBill(
      dto,
      user.tenantId,
      user.id,
    );
  }

  @Get('vendor-bills')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Listar facturas de proveedor con estado de 3-Way Matching' })
  async findAllBills(@CurrentUser() user: AuthenticatedUser) {
    return this.threeWayMatchingService.findAllBills(user.tenantId);
  }

  @Get('vendor-bills/:id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Detalle de factura de proveedor con validación cruzada' })
  async findOneBill(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.threeWayMatchingService.findOneBill(id, user.tenantId);
  }

  @Patch('vendor-bills/:id/approve')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Aprobar y contabilizar Factura de Proveedor',
    description:
      'Cambia el estado de la factura de DRAFT a POSTED (contabilizada), habilitando el pago.',
  })
  async approveBill(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.threeWayMatchingService.approveBill(
      id,
      user.tenantId,
      user.id,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // REABASTECIMIENTO AUTOMÁTICO Y LISTAS DE PRECIOS DE PROVEEDORES
  // ────────────────────────────────────────────────────────────────────────────

  @Post('reordering-rules')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Crear / Actualizar regla de reabastecimiento automático',
    description:
      'Define stock mínimo, stock máximo y cantidad a pedir por producto/bodega. ' +
      'El sistema evaluará estas reglas y alertará cuando el stock caiga por debajo del mínimo.',
  })
  async upsertReorderingRule(
    @Body() dto: CreateReorderingRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reorderingService.upsertRule(dto, user.tenantId);
  }

  @Get('reordering-rules')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Listar reglas de reabastecimiento activas' })
  async findAllRules(@CurrentUser() user: AuthenticatedUser) {
    return this.reorderingService.findAllRules(user.tenantId);
  }

  @Get('reordering-alerts')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Evaluar stock y obtener alertas de reabastecimiento',
    description:
      'Compara el stock actual contra las reglas definidas. Retorna la lista de ' +
      'productos bajo el mínimo con la cantidad sugerida a pedir y el proveedor preferido.',
  })
  async getReorderingAlerts(@CurrentUser() user: AuthenticatedUser) {
    return this.reorderingService.evaluateAndGetAlerts(user.tenantId);
  }

  @Post('vendor-prices')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Registrar precio de proveedor para un producto',
    description:
      'Permite registrar múltiples proveedores con sus costos y lead times para un mismo producto.',
  })
  async upsertVendorPrice(
    @Body() dto: CreateVendorPriceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reorderingService.upsertVendorPrice(dto, user.tenantId);
  }

  @Get('vendor-prices')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Listar precios de proveedores' })
  @ApiQuery({ name: 'productId', required: false, description: 'Filtrar por producto' })
  async findVendorPrices(
    @Query('productId') productId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reorderingService.findVendorPrices(user.tenantId, productId);
  }
}
