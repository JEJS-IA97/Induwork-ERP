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
import { PriceListsService } from './services/price-lists.service';
import { PromotionsService } from './services/promotions.service';
import { LoyaltyService } from './services/loyalty.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { BulkPriceAdjustmentDto } from './dto/bulk-price-adjustment.dto';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { ValidatePromoDto } from './dto/validate-promo.dto';
import { EarnPointsDto, RedeemPointsDto } from './dto/loyalty-points.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Pricing & Promotions')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant (ej: coimsa, induwork, inversiones-mvi)',
})
@Controller('pricing')
export class PricingController {
  constructor(
    private readonly priceListsService: PriceListsService,
    private readonly promotionsService: PromotionsService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  // -------------------------------------------------------------
  // LISTAS DE PRECIOS & GESTIÓN MASIVA
  // -------------------------------------------------------------

  @Get('price-lists')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Listar todas las listas de precios (Mayorista, Minorista, etc.)' })
  @ApiResponse({ status: 200, description: 'Listado de listas de precios.' })
  async findAllPriceLists(@CurrentUser() user: AuthenticatedUser) {
    return this.priceListsService.findAll(user.tenantId);
  }

  @Get('price-lists/:id')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Obtener detalle de una lista de precios con sus productos' })
  async findOnePriceList(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.priceListsService.findOne(id, user.tenantId);
  }

  @Post('price-lists')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Crear nueva lista de precios' })
  @ApiResponse({ status: 201, description: 'Lista de precios creada exitosamente.' })
  async createPriceList(
    @Body() dto: CreatePriceListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.priceListsService.create(dto, user.tenantId);
  }

  @Post('bulk-adjustment')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Modificación masiva de precios por porcentaje o valor fijo',
    description:
      'Aplica aumentos o descuentos porcentuales (ej: +15%, -10%) a todos los productos, a una categoría o a una lista de precios específica.',
  })
  @ApiResponse({ status: 200, description: 'Precios actualizados masivamente.' })
  async bulkPriceAdjustment(
    @Body() dto: BulkPriceAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.priceListsService.bulkPriceAdjustment(
      dto,
      user.tenantId,
      user.id,
    );
  }

  @Post('price-lists/:id/items')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Asignar precio específico a un producto en una lista de precios' })
  async assignItemPrice(
    @Param('id') priceListId: string,
    @Body('productId') productId: string,
    @Body('variantId') variantId: string,
    @Body('fixedPrice') fixedPrice: number,
    @Body('percentAdjustment') percentAdjustment: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.priceListsService.assignItemPrice(
      priceListId,
      productId,
      variantId,
      fixedPrice,
      percentAdjustment,
      user.tenantId,
    );
  }

  // -------------------------------------------------------------
  // PROMOCIONES, CUPONES & PROGRAMAS DE DESCUENTO
  // -------------------------------------------------------------

  @Get('promotions')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Listar promociones y programas de descuento activos' })
  async findAllPromotions(@CurrentUser() user: AuthenticatedUser) {
    return this.promotionsService.findAll(user.tenantId);
  }

  @Post('promotions')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Crear nueva promoción (Código, Envío Gratis, Buy X Get Y, Lealtad)',
  })
  @ApiResponse({ status: 201, description: 'Programa de promoción creado.' })
  async createPromotion(
    @Body() dto: CreatePromotionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.promotionsService.create(dto, user.tenantId, user.id);
  }

  @Post('promotions/validate')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR, Role.USER)
  @ApiOperation({
    summary: 'Validar cupón / promoción y calcular descuento en carrito',
    description:
      'Calcula descuentos automáticos (Envío gratis > $50.000, Buy X Get Y, Cupones, Lealtad 10+1).',
  })
  @ApiResponse({ status: 200, description: 'Cálculo de descuento aplicado.' })
  async validatePromotion(
    @Body() dto: ValidatePromoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.promotionsService.validateAndCalculateDiscount(
      dto,
      user.tenantId,
    );
  }

  @Post('promotions/next-order-coupon')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Generar cupón de regalo para la próxima orden del cliente' })
  async generateNextOrderCoupon(
    @Body('customerId') customerId: string,
    @Body('discountPercent') discountPercent: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.promotionsService.generateNextOrderCoupon(
      customerId,
      user.tenantId,
      discountPercent,
    );
  }

  // -------------------------------------------------------------
  // TARJETAS DE LEALTAD & PUNTOS
  // -------------------------------------------------------------

  @Get('loyalty/card/:customerId')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR, Role.USER)
  @ApiOperation({ summary: 'Consultar tarjeta de lealtad y saldo de puntos del cliente' })
  async getLoyaltyCard(
    @Param('customerId') customerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loyaltyService.getOrCreateLoyaltyCard(
      customerId,
      user.tenantId,
    );
  }

  @Post('loyalty/earn')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Acumular puntos de lealtad por compra realizada' })
  async earnLoyaltyPoints(
    @Body() dto: EarnPointsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loyaltyService.earnPoints(dto, user.tenantId);
  }

  @Post('loyalty/redeem')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR, Role.USER)
  @ApiOperation({ summary: 'Canjear puntos de lealtad por descuento en dinero' })
  async redeemLoyaltyPoints(
    @Body() dto: RedeemPointsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loyaltyService.redeemPoints(dto, user.tenantId);
  }
}
