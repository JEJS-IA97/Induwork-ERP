import {
  Controller,
  Get,
  Post,
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
import { InventoryService } from './inventory.service';
import { BomService } from './services/bom.service';
import { LotSerialService } from './services/lot-serial.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateBomDto, AssembleKitDto } from './dto/create-bom.dto';
import { CreateLotSerialDto } from './dto/create-lot-serial.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';
import { LotSerialType } from '@prisma/client';

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant (coimsa | induwork | inversiones-mvi)',
})
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly bomService: BomService,
    private readonly lotSerialService: LotSerialService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // EXISTENCIAS Y MOVIMIENTOS BÁSICOS (KARDEX)
  // ────────────────────────────────────────────────────────────────────────────

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
  @ApiOperation({ summary: 'Registrar un movimiento de stock manual (Entrada/Salida/Ajuste)' })
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

  // ────────────────────────────────────────────────────────────────────────────
  // LISTAS DE MATERIALES Y KITS (BOM)
  // ────────────────────────────────────────────────────────────────────────────

  @Post('bom')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Crear Lista de Materiales / Kit (BOM)',
    description: 'Define la estructura de componentes requeridos para armar un producto kit o terminado.',
  })
  @ApiResponse({ status: 201, description: 'Lista de materiales creada.' })
  async createBom(
    @Body() dto: CreateBomDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bomService.create(dto, user.tenantId);
  }

  @Get('bom')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Listar listas de materiales y kits activos' })
  async findAllBoms(@CurrentUser() user: AuthenticatedUser) {
    return this.bomService.findAll(user.tenantId);
  }

  @Get('bom/:id')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Detalle de Lista de Materiales con todos sus componentes' })
  @ApiParam({ name: 'id', description: 'ID del BOM' })
  async findOneBom(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bomService.findOne(id, user.tenantId);
  }

  @Get('bom/:id/availability')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({
    summary: 'Calcular disponibilidad de kits según existencias de componentes',
    description:
      'Explosiona la lista de componentes y calcula el número máximo de kits ' +
      'que se pueden armar con el stock físico disponible en bodega.',
  })
  @ApiParam({ name: 'id', description: 'ID del BOM' })
  @ApiQuery({ name: 'warehouseLocation', required: false, description: 'Bodega de consulta (default: BODEGA_CENTRAL)' })
  async checkKitAvailability(
    @Param('id') id: string,
    @Query('warehouseLocation') warehouseLocation: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bomService.checkKitAvailability(
      id,
      user.tenantId,
      warehouseLocation || 'BODEGA_CENTRAL',
    );
  }

  @Post('bom/:id/assemble')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Ensamblar Kit o fabricar producto terminado',
    description:
      'Consume atómicamente los componentes del stock (Kardex: SALIDA) e ' +
      'ingresa las unidades del kit armado a bodega (Kardex: ENTRADA).',
  })
  @ApiParam({ name: 'id', description: 'ID del BOM' })
  @ApiResponse({ status: 201, description: 'Kit ensamblado exitosamente.' })
  async assembleKit(
    @Param('id') id: string,
    @Body() dto: AssembleKitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bomService.assembleKit(
      id,
      dto,
      user.tenantId,
      user.id,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // TRAZABILIDAD: LOTES Y NÚMEROS DE SERIE
  // ────────────────────────────────────────────────────────────────────────────

  @Post('lot-serials')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Registrar número de serie o lote de un producto',
    description: 'Permite registrar números de serie individuales o lotes con fecha de vencimiento y garantía.',
  })
  @ApiResponse({ status: 201, description: 'Lote o serie registrado.' })
  async createLotSerial(
    @Body() dto: CreateLotSerialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lotSerialService.create(dto, user.tenantId);
  }

  @Get('lot-serials')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Listar lotes y números de serie registrados' })
  @ApiQuery({ name: 'productId', required: false, description: 'Filtrar por ID de producto' })
  @ApiQuery({ name: 'type', required: false, enum: LotSerialType, description: 'Filtrar por tipo (SERIAL o LOT)' })
  async findAllLotSerials(
    @Query('productId') productId: string,
    @Query('type') type: LotSerialType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lotSerialService.findAll(user.tenantId, productId, type);
  }

  @Get('lot-serials/:id')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Detalle de un lote o número de serie' })
  @ApiParam({ name: 'id', description: 'ID del lote o número de serie' })
  async findOneLotSerial(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lotSerialService.findOne(id, user.tenantId);
  }

  @Get('lot-serials/:id/traceability')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE)
  @ApiOperation({
    summary: 'Consultar Trazabilidad 360° de un Lote o Número de Serie',
    description:
      'Retorna la historia completa de trazabilidad: recepción del proveedor, ' +
      'traslados entre bodegas internas y guía de despacho de entrega al cliente.',
  })
  @ApiParam({ name: 'id', description: 'ID del lote o número de serie' })
  async getLotSerialTraceability(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lotSerialService.getTraceability(id, user.tenantId);
  }
}
