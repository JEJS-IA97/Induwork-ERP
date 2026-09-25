import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreatePromotionDto } from '../dto/create-promotion.dto';
import { ValidatePromoDto } from '../dto/validate-promo.dto';
import {
  PromotionType,
  DiscountType,
  CouponStatus,
  CustomerType,
} from '@prisma/client';
import * as crypto from 'crypto';

interface ResolvedCartItem {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verifica que un cliente pertenezca al tenant actual.
   */
  private async validateCustomer(
    customerId: string,
    tenantId: string,
  ) {
    const customer =
      await this.prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId,
          isActive: true,
          type: {
            in: [
              CustomerType.CLIENTE,
              CustomerType.AMBOS,
            ],
          },
        },
      });

    if (!customer) {
      throw new NotFoundException(
        'El cliente no existe dentro del tenant actual o está inactivo.',
      );
    }

    return customer;
  }

  /**
   * Verifica que un producto pertenezca al tenant.
   */
  private async validateProduct(
    productId: string,
    tenantId: string,
  ) {
    const product =
      await this.prisma.product.findFirst({
        where: {
          id: productId,
          tenantId,
          isActive: true,
          isArchived: false,
        },
      });

    if (!product) {
      throw new NotFoundException(
        `El producto '${productId}' no pertenece al tenant actual o está inactivo.`,
      );
    }

    return product;
  }

  /**
   * Calcula el carrito usando exclusivamente precios de la BD.
   */
  private async resolveCart(
    items: ValidatePromoDto['items'],
    tenantId: string,
  ): Promise<{
    items: ResolvedCartItem[];
    orderAmount: number;
  }> {
    if (
      !items ||
      items.length === 0
    ) {
      throw new BadRequestException(
        'El carrito debe contener al menos un producto.',
      );
    }

    const resolvedItems: ResolvedCartItem[] =
      [];

    let orderAmount = 0;

    for (const item of items) {
      const product =
        await this.validateProduct(
          item.productId,
          tenantId,
        );

      let variant = null;

      if (item.variantId) {
        variant =
          await this.prisma.productVariant.findFirst({
            where: {
              id: item.variantId,
              tenantId,
              productId:
                product.id,
              isActive: true,
            },
          });

        if (!variant) {
          throw new NotFoundException(
            `La variante '${item.variantId}' no pertenece al producto indicado o al tenant actual.`,
          );
        }
      }

      const unitPrice =
        Number(
          variant?.price ??
            product.price,
        );

      if (
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        throw new BadRequestException(
          `El producto '${product.name}' tiene un precio inválido configurado.`,
        );
      }

      const subtotal =
        Math.round(
          item.quantity *
            unitPrice,
        );

      orderAmount += subtotal;

      resolvedItems.push({
        productId:
          product.id,
        variantId:
          variant?.id || null,
        quantity:
          item.quantity,
        unitPrice,
        subtotal,
      });
    }

    return {
      items: resolvedItems,
      orderAmount:
        Math.round(orderAmount),
    };
  }

  /**
   * Lista promociones del tenant.
   */
  async findAll(
    tenantId: string,
  ) {
    return this.prisma.promotionProgram.findMany({
      where: {
        tenantId,
      },
      include: {
        _count: {
          select: {
            coupons: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Crea un programa promocional.
   */
  async create(
    dto: CreatePromotionDto,
    tenantId: string,
    userId?: string,
  ) {
    if (dto.code) {
      const existing =
        await this.prisma.promotionProgram.findFirst({
          where: {
            tenantId,
            code:
              dto.code
                .trim()
                .toUpperCase(),
          },
        });

      if (existing) {
        throw new ConflictException(
          `Ya existe una promoción con el código '${dto.code}'.`,
        );
      }
    }

    if (
      dto.discountValue !==
        undefined &&
      dto.discountValue < 0
    ) {
      throw new BadRequestException(
        'El valor del descuento no puede ser negativo.',
      );
    }

    if (
      dto.discountType ===
        DiscountType.PERCENTAGE &&
      dto.discountValue !==
        undefined &&
      dto.discountValue > 100
    ) {
      throw new BadRequestException(
        'El porcentaje de descuento no puede superar 100%.',
      );
    }

    if (
      dto.rewardProductId
    ) {
      await this.validateProduct(
        dto.rewardProductId,
        tenantId,
      );
    }

    const promo =
      await this.prisma.promotionProgram.create({
        data: {
          tenantId,
          name: dto.name,
          code: dto.code
            ? dto.code
                .trim()
                .toUpperCase()
            : null,
          type: dto.type,
          discountType:
            dto.discountType,
          discountValue:
            dto.discountValue || 0,
          minOrderAmount:
            dto.minOrderAmount,
          buyQuantity:
            dto.buyQuantity,
          getQuantity:
            dto.getQuantity,
          rewardProductId:
            dto.rewardProductId,
          loyaltyTargetCount:
            dto.loyaltyTargetCount ||
            10,
          maxUsageCount:
            dto.maxUsageCount,
          startDate:
            dto.startDate
              ? new Date(
                  dto.startDate,
                )
              : null,
          endDate:
            dto.endDate
              ? new Date(
                  dto.endDate,
                )
              : null,
        },
      });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action:
          'CREATE_PROMOTION_PROGRAM',
        entityName:
          'PromotionProgram',
        entityId: promo.id,
        newValues: {
          name: promo.name,
          type: promo.type,
          code: promo.code,
        },
      },
    });

    return promo;
  }

  /**
   * Valida una promoción/cupón y calcula el descuento.
   *
   * Los precios y el subtotal se calculan desde la BD.
   */
  async validateAndCalculateDiscount(
    dto: ValidatePromoDto,
    tenantId: string,
  ) {
    const {
      code,
      customerId,
    } = dto;

    const customer =
      customerId
        ? await this.validateCustomer(
            customerId,
            tenantId,
          )
        : null;

    const resolvedCart =
      await this.resolveCart(
        dto.items,
        tenantId,
      );

    const {
      items,
      orderAmount,
    } = resolvedCart;

    const now = new Date();

    let discountAmount = 0;
    let appliedPromotionName:
      | string
      | null = null;
    let isFreeShipping = false;
    let appliedCouponId:
      | string
      | null = null;

    if (code) {
      const cleanCode =
        code
          .trim()
          .toUpperCase();

      const coupon =
        await this.prisma.coupon.findFirst({
          where: {
            tenantId,
            code: cleanCode,
            status:
              CouponStatus.ACTIVE,
          },
          include: {
            program: true,
          },
        });

      if (coupon) {
        if (
          coupon.expirationDate &&
          coupon.expirationDate <
            now
        ) {
          throw new BadRequestException(
            'El cupón introducido ha expirado.',
          );
        }

        if (
          coupon.customerId &&
          (!customer ||
            coupon.customerId !==
              customer.id)
        ) {
          throw new BadRequestException(
            'Este cupón está asignado a otro cliente o requiere identificar al cliente.',
          );
        }

        const program =
          coupon.program;

        if (
          program.minOrderAmount &&
          orderAmount <
            Number(
              program.minOrderAmount,
            )
        ) {
          throw new BadRequestException(
            `El monto mínimo de compra para este cupón es de $${Number(
              program.minOrderAmount,
            ).toLocaleString('es-CL')}.`,
          );
        }

        if (
          program.discountType ===
          DiscountType.PERCENTAGE
        ) {
          discountAmount =
            (orderAmount *
              Number(
                program.discountValue,
              )) /
            100;
        } else if (
          program.discountType ===
          DiscountType.FIXED_AMOUNT
        ) {
          discountAmount =
            Math.min(
              Number(
                program.discountValue,
              ),
              orderAmount,
            );
        } else if (
          program.discountType ===
          DiscountType.FREE_SHIPPING
        ) {
          isFreeShipping =
            true;
        }

        appliedPromotionName =
          `${program.name} (Cupón: ${coupon.code})`;

        appliedCouponId =
          coupon.id;
      } else {
        const promoProgram =
          await this.prisma.promotionProgram.findFirst({
            where: {
              tenantId,
              code: cleanCode,
              isActive: true,
            },
          });

        if (!promoProgram) {
          throw new NotFoundException(
            'Código de promoción o cupón no válido.',
          );
        }

        if (
          promoProgram.startDate &&
          promoProgram.startDate >
            now
        ) {
          throw new BadRequestException(
            'La promoción aún no ha comenzado.',
          );
        }

        if (
          promoProgram.endDate &&
          promoProgram.endDate <
            now
        ) {
          throw new BadRequestException(
            'La promoción ha expirado.',
          );
        }

        if (
          promoProgram.maxUsageCount &&
          promoProgram.currentUsageCount >=
            promoProgram.maxUsageCount
        ) {
          throw new BadRequestException(
            'La promoción ha alcanzado el límite máximo de usos.',
          );
        }

        if (
          promoProgram.minOrderAmount &&
          orderAmount <
            Number(
              promoProgram.minOrderAmount,
            )
        ) {
          throw new BadRequestException(
            `El monto mínimo de compra para esta promoción es de $${Number(
              promoProgram.minOrderAmount,
            ).toLocaleString('es-CL')}.`,
          );
        }

        if (
          promoProgram.discountType ===
          DiscountType.PERCENTAGE
        ) {
          discountAmount =
            (orderAmount *
              Number(
                promoProgram.discountValue,
              )) /
            100;
        } else if (
          promoProgram.discountType ===
          DiscountType.FIXED_AMOUNT
        ) {
          discountAmount =
            Math.min(
              Number(
                promoProgram.discountValue,
              ),
              orderAmount,
            );
        } else if (
          promoProgram.discountType ===
          DiscountType.FREE_SHIPPING
        ) {
          isFreeShipping =
            true;
        }

        appliedPromotionName =
          `${promoProgram.name} (${promoProgram.code})`;
      }
    }

    const autoPromos =
      await this.prisma.promotionProgram.findMany({
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
      if (
        promo.type ===
          PromotionType.FREE_SHIPPING &&
        promo.minOrderAmount &&
        orderAmount >=
          Number(
            promo.minOrderAmount,
          )
      ) {
        isFreeShipping =
          true;

        if (
          !appliedPromotionName
        ) {
          appliedPromotionName =
            promo.name;
        }
      }

      if (
        promo.type ===
          PromotionType.BUY_X_GET_Y &&
        promo.buyQuantity &&
        promo.getQuantity &&
        items.length > 0
      ) {
        for (const item of items) {
          const packageSize =
            promo.buyQuantity +
            promo.getQuantity;

          if (
            item.quantity >=
            packageSize
          ) {
            const freeUnits =
              Math.floor(
                item.quantity /
                  packageSize,
              ) *
              promo.getQuantity;

            const itemDiscount =
              Math.round(
                freeUnits *
                  item.unitPrice,
              );

            discountAmount +=
              itemDiscount;

            appliedPromotionName =
              `${promo.name} (${freeUnits} unidad(es) bonificada(s))`;
          }
        }
      }
    }

    if (customer) {
      const loyaltyCard =
        await this.prisma.loyaltyCard.findFirst({
          where: {
            tenantId,
            customerId:
              customer.id,
          },
        });

      if (
        loyaltyCard &&
        loyaltyCard.totalPurchasesCount >
          0 &&
        loyaltyCard.totalPurchasesCount %
          10 ===
          0
      ) {
        const loyaltyDiscount =
          Math.round(
            (orderAmount * 10) /
              100,
          );

        if (
          loyaltyDiscount >
          discountAmount
        ) {
          discountAmount =
            loyaltyDiscount;

          appliedPromotionName =
            `Recompensa de Lealtad: 10% en tu compra #${
              loyaltyCard.totalPurchasesCount +
              1
            }`;
        }
      }
    }

    discountAmount =
      Math.min(
        Math.max(
          0,
          Math.round(
            discountAmount,
          ),
        ),
        orderAmount,
      );

    const finalAmount =
      Math.max(
        0,
        orderAmount -
          discountAmount,
      );

    return {
      isValid: true,
      originalAmount:
        orderAmount,
      discountAmount,
      finalAmount:
        Math.round(
          finalAmount,
        ),
      appliedPromotionName,
      isFreeShipping,
      appliedCouponId,
    };
  }

  /**
   * Genera un cupón automático para la próxima orden.
   */
  async generateNextOrderCoupon(
    customerId: string,
    tenantId: string,
    discountPercent: number = 10,
    expirationDays: number = 30,
  ) {
    await this.validateCustomer(
      customerId,
      tenantId,
    );

    if (
      !Number.isFinite(
        discountPercent,
      ) ||
      discountPercent <= 0 ||
      discountPercent > 100
    ) {
      throw new BadRequestException(
        'El porcentaje de descuento debe estar entre 0 y 100.',
      );
    }

    if (
      !Number.isInteger(
        expirationDays,
      ) ||
      expirationDays < 1 ||
      expirationDays > 365
    ) {
      throw new BadRequestException(
        'La vigencia del cupón debe estar entre 1 y 365 días.',
      );
    }

    let program =
      await this.prisma.promotionProgram.findFirst({
        where: {
          tenantId,
          type:
            PromotionType.NEXT_ORDER_COUPON,
          isActive: true,
        },
      });

    if (!program) {
      program =
        await this.prisma.promotionProgram.create({
          data: {
            tenantId,
            name:
              'Cupón de Regalo para Próxima Orden',
            type:
              PromotionType.NEXT_ORDER_COUPON,
            discountType:
              DiscountType.PERCENTAGE,
            discountValue:
              discountPercent,
          },
        });
    }

    const randomSuffix =
      crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase();

    const couponCode =
      `NEXT-${randomSuffix}`;

    const expirationDate =
      new Date();

    expirationDate.setDate(
      expirationDate.getDate() +
        expirationDays,
    );

    return this.prisma.coupon.create({
      data: {
        tenantId,
        programId:
          program.id,
        customerId,
        code: couponCode,
        discountValue:
          discountPercent,
        expirationDate,
        status:
          CouponStatus.ACTIVE,
      },
      include: {
        customer: true,
      },
    });
  }
}