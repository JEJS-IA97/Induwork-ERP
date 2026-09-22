import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreatePromotionDto } from '../dto/create-promotion.dto';
import { ValidatePromoDto } from '../dto/validate-promo.dto';
import { PromotionType, DiscountType, CouponStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listar promociones activas y programas de descuento
   */
  async findAll(tenantId: string) {
    return this.prisma.promotionProgram.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { coupons: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Crear nuevo programa de promoción o regla de descuento
   */
  async create(dto: CreatePromotionDto, tenantId: string, userId?: string) {
    if (dto.code) {
      const existing = await this.prisma.promotionProgram.findFirst({
        where: { tenantId, code: dto.code.toUpperCase() },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe una promoción con el código '${dto.code}'.`,
        );
      }
    }

    const promo = await this.prisma.promotionProgram.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code ? dto.code.toUpperCase() : null,
        type: dto.type,
        discountType: dto.discountType,
        discountValue: dto.discountValue || 0,
        minOrderAmount: dto.minOrderAmount,
        buyQuantity: dto.buyQuantity,
        getQuantity: dto.getQuantity,
        rewardProductId: dto.rewardProductId,
        loyaltyTargetCount: dto.loyaltyTargetCount || 10,
        maxUsageCount: dto.maxUsageCount,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'CREATE_PROMOTION_PROGRAM',
        entityName: 'PromotionProgram',
        entityId: promo.id,
        newValues: { name: promo.name, type: promo.type, code: promo.code },
      },
    });

    return promo;
  }

  /**
   * Validar y calcular descuentos de cupones, promociones automáticas y Buy X Get Y
   */
  async validateAndCalculateDiscount(dto: ValidatePromoDto, tenantId: string) {
    const { code, orderAmount, customerId, items = [] } = dto;
    const now = new Date();

    let discountAmount = 0;
    let appliedPromotionName: string | null = null;
    let isFreeShipping = false;
    let appliedCouponId: string | null = null;

    // 1. Verificar si se proporcionó un código (Cupón o Promoción con código)
    if (code) {
      const cleanCode = code.trim().toUpperCase();

      // Buscar si es un cupón individual único
      const coupon = await this.prisma.coupon.findFirst({
        where: {
          tenantId,
          code: cleanCode,
          status: CouponStatus.ACTIVE,
        },
        include: { program: true },
      });

      if (coupon) {
        if (coupon.expirationDate && coupon.expirationDate < now) {
          throw new BadRequestException('El cupón introducido ha expirado.');
        }

        if (coupon.customerId && customerId && coupon.customerId !== customerId) {
          throw new BadRequestException('Este cupón está asignado a otro cliente.');
        }

        const program = coupon.program;
        if (program.minOrderAmount && orderAmount < Number(program.minOrderAmount)) {
          throw new BadRequestException(
            `El monto mínimo de compra para este cupón es de $${Number(
              program.minOrderAmount,
            ).toLocaleString('es-CL')}.`,
          );
        }

        if (program.discountType === DiscountType.PERCENTAGE) {
          discountAmount = (orderAmount * Number(program.discountValue)) / 100;
        } else if (program.discountType === DiscountType.FIXED_AMOUNT) {
          discountAmount = Math.min(Number(program.discountValue), orderAmount);
        } else if (program.discountType === DiscountType.FREE_SHIPPING) {
          isFreeShipping = true;
        }

        appliedPromotionName = `${program.name} (Cupón: ${coupon.code})`;
        appliedCouponId = coupon.id;
      } else {
        // Buscar si es un código promocional global
        const promoProgram = await this.prisma.promotionProgram.findFirst({
          where: {
            tenantId,
            code: cleanCode,
            isActive: true,
          },
        });

        if (!promoProgram) {
          throw new NotFoundException('Código de promoción o cupón no válido.');
        }

        if (promoProgram.startDate && promoProgram.startDate > now) {
          throw new BadRequestException('La promoción aún no ha comenzado.');
        }

        if (promoProgram.endDate && promoProgram.endDate < now) {
          throw new BadRequestException('La promoción ha expirado.');
        }

        if (
          promoProgram.maxUsageCount &&
          promoProgram.currentUsageCount >= promoProgram.maxUsageCount
        ) {
          throw new BadRequestException('La promoción ha alcanzado el límite máximo de usos.');
        }

        if (promoProgram.minOrderAmount && orderAmount < Number(promoProgram.minOrderAmount)) {
          throw new BadRequestException(
            `El monto mínimo de compra para esta promoción es de $${Number(
              promoProgram.minOrderAmount,
            ).toLocaleString('es-CL')}.`,
          );
        }

        if (promoProgram.discountType === DiscountType.PERCENTAGE) {
          discountAmount = (orderAmount * Number(promoProgram.discountValue)) / 100;
        } else if (promoProgram.discountType === DiscountType.FIXED_AMOUNT) {
          discountAmount = Math.min(Number(promoProgram.discountValue), orderAmount);
        } else if (promoProgram.discountType === DiscountType.FREE_SHIPPING) {
          isFreeShipping = true;
        }

        appliedPromotionName = `${promoProgram.name} (${promoProgram.code})`;
      }
    }

    // 2. Evaluar Promociones Automáticas activas (ej: Envío Gratis en órdenes > $X, Buy X Get Y)
    const autoPromos = await this.prisma.promotionProgram.findMany({
      where: {
        tenantId,
        isActive: true,
        type: {
          in: [
            PromotionType.AUTOMATIC_DISCOUNT,
            PromotionType.FREE_SHIPPING,
            PromotionType.BUY_X_GET_Y,
          ],
        },
      },
    });

    for (const promo of autoPromos) {
      // Envío gratuito automático por monto
      if (
        promo.type === PromotionType.FREE_SHIPPING &&
        promo.minOrderAmount &&
        orderAmount >= Number(promo.minOrderAmount)
      ) {
        isFreeShipping = true;
        if (!appliedPromotionName) {
          appliedPromotionName = promo.name;
        }
      }

      // Regla "Comprar X y Recibir Y gratis" (ej: Compre 2 y lleve el 3ro gratis)
      if (
        promo.type === PromotionType.BUY_X_GET_Y &&
        promo.buyQuantity &&
        promo.getQuantity &&
        items.length > 0
      ) {
        for (const item of items) {
          if (item.quantity >= promo.buyQuantity + promo.getQuantity) {
            const freeUnits = Math.floor(
              item.quantity / (promo.buyQuantity + promo.getQuantity),
            ) * promo.getQuantity;
            const itemDiscount = freeUnits * item.unitPrice;
            discountAmount += itemDiscount;
            appliedPromotionName = `${promo.name} (${freeUnits} unidad(es) bonificada(s))`;
          }
        }
      }
    }

    // 3. Evaluar Regla de Lealtad por Frecuencia de Compra (ej: Compre 10 y obtenga 10% en el 11°)
    if (customerId) {
      const loyaltyCard = await this.prisma.loyaltyCard.findFirst({
        where: { tenantId, customerId },
      });

      if (loyaltyCard && loyaltyCard.totalPurchasesCount > 0 && loyaltyCard.totalPurchasesCount % 10 === 0) {
        const loyaltyDiscount = (orderAmount * 10) / 100; // 10% de descuento en la compra número 11
        if (loyaltyDiscount > discountAmount) {
          discountAmount = loyaltyDiscount;
          appliedPromotionName = `Recompensa de Lealtad: 10% en tu compra #${loyaltyCard.totalPurchasesCount + 1}`;
        }
      }
    }

    const finalAmount = Math.max(0, orderAmount - discountAmount);

    return {
      isValid: true,
      originalAmount: orderAmount,
      discountAmount: Math.round(discountAmount),
      finalAmount: Math.round(finalAmount),
      appliedPromotionName,
      isFreeShipping,
      appliedCouponId,
    };
  }

  /**
   * Generar cupón automático para la próxima orden de compra
   */
  async generateNextOrderCoupon(
    customerId: string,
    tenantId: string,
    discountPercent: number = 10,
    expirationDays: number = 30,
  ) {
    let program = await this.prisma.promotionProgram.findFirst({
      where: {
        tenantId,
        type: PromotionType.NEXT_ORDER_COUPON,
        isActive: true,
      },
    });

    if (!program) {
      program = await this.prisma.promotionProgram.create({
        data: {
          tenantId,
          name: 'Cupón de Regalo para Próxima Orden',
          type: PromotionType.NEXT_ORDER_COUPON,
          discountType: DiscountType.PERCENTAGE,
          discountValue: discountPercent,
        },
      });
    }

    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const couponCode = `NEXT-${randomSuffix}`;

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + expirationDays);

    return this.prisma.coupon.create({
      data: {
        tenantId,
        programId: program.id,
        customerId,
        code: couponCode,
        discountValue: discountPercent,
        expirationDate,
        status: CouponStatus.ACTIVE,
      },
      include: { customer: true },
    });
  }
}
