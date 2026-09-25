import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  EarnPointsDto,
  RedeemPointsDto,
} from '../dto/loyalty-points.dto';
import {
  CustomerType,
  OrderStatus,
} from '@prisma/client';

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verifica que el cliente pertenezca al tenant actual
   * y pueda participar en el programa de lealtad.
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
        'El cliente no existe dentro del tenant actual o no puede participar en el programa de lealtad.',
      );
    }

    return customer;
  }

  /**
   * Obtiene una orden perteneciente al tenant actual.
   */
  private async findOrder(
    orderId: string,
    tenantId: string,
  ) {
    const order =
      await this.prisma.order.findFirst({
        where: {
          id: orderId,
          tenantId,
        },
        select: {
          id: true,
          customerId: true,
          totalAmount: true,
          status: true,
        },
      });

    if (!order) {
      throw new NotFoundException(
        'La orden indicada no existe dentro del tenant actual.',
      );
    }

    return order;
  }

  /**
   * Obtener o inicializar tarjeta de lealtad de un cliente.
   */
  async getOrCreateLoyaltyCard(
    customerId: string,
    tenantId: string,
  ) {
    await this.validateCustomer(
      customerId,
      tenantId,
    );

    let program =
      await this.prisma.loyaltyProgram.findFirst({
        where: {
          tenantId,
          isActive: true,
        },
      });

    if (!program) {
      program =
        await this.prisma.loyaltyProgram.create({
          data: {
            tenantId,
            name:
              'Programa de Lealtad y Puntos Corporativo',
            pointsPerSpent: 1.0,
            minPointsToRedeem: 100,
            pointsValueClp: 10.0,
          },
        });
    }

    let card =
      await this.prisma.loyaltyCard.findFirst({
        where: {
          tenantId,
          customerId,
        },
        include: {
          transactions: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 20,
          },
        },
      });

    if (!card) {
      const cardNumber =
        `CARD-${Date.now()
          .toString()
          .slice(-6)}`;

      card =
        await this.prisma.loyaltyCard.create({
          data: {
            tenantId,
            programId: program.id,
            customerId,
            cardNumber,
            currentPoints: 0,
          },
          include: {
            transactions: true,
          },
        });
    }

    return card;
  }

  /**
   * Acumular puntos por una orden realmente creada.
   *
   * El monto y el cliente nunca vienen del frontend:
   * ambos se resuelven desde la orden.
   */
  async earnPoints(
    dto: EarnPointsDto,
    tenantId: string,
  ) {
    const order =
      await this.findOrder(
        dto.orderId,
        tenantId,
      );

    if (
      order.status !==
        OrderStatus.PAID &&
      order.status !==
        OrderStatus.SHIPPED
    ) {
      throw new BadRequestException(
        'Solo se pueden acumular puntos por órdenes pagadas o despachadas.',
      );
    }

    const card =
      await this.getOrCreateLoyaltyCard(
        order.customerId,
        tenantId,
      );

    const program =
      await this.prisma.loyaltyProgram.findFirst({
        where: {
          id: card.programId,
          tenantId,
          isActive: true,
        },
      });

    if (!program) {
      throw new NotFoundException(
        'El programa de lealtad asociado a la tarjeta no está disponible.',
      );
    }

    const purchaseAmount =
      Math.round(
        Number(order.totalAmount),
      );

    const pointsMultiplier =
      Number(program.pointsPerSpent);

    const pointsToEarn = Math.floor(
      (purchaseAmount / 1000) *
        pointsMultiplier,
    );

    return this.prisma.$transaction(
      async (tx) => {
        const existingTransaction =
          await tx.loyaltyTransaction.findFirst({
            where: {
              tenantId,
              cardId: card.id,
              orderId: order.id,
              type: 'EARNED',
            },
          });

        if (existingTransaction) {
          throw new ConflictException(
            'Los puntos de esta orden ya fueron registrados.',
          );
        }

        const updatedCard =
          await tx.loyaltyCard.update({
            where: {
              id: card.id,
            },
            data: {
              currentPoints: {
                increment:
                  pointsToEarn,
              },
              totalEarnedPoints: {
                increment:
                  pointsToEarn,
              },
              totalPurchasesCount: {
                increment: 1,
              },
            },
          });

        const transaction =
          await tx.loyaltyTransaction.create({
            data: {
              tenantId,
              cardId: card.id,
              orderId: order.id,
              points: pointsToEarn,
              type: 'EARNED',
              description:
                `Puntos ganados por orden ${order.id} por $${purchaseAmount.toLocaleString(
                  'es-CL',
                )}`,
            },
          });

        return {
          card: updatedCard,
          orderId: order.id,
          pointsEarned:
            pointsToEarn,
          purchaseAmount,
          transaction,
        };
      },
    );
  }

  /**
   * Canjear puntos sobre una orden existente.
   *
   * La identidad del cliente se obtiene desde la orden.
   */
  async redeemPoints(
    dto: RedeemPointsDto,
    tenantId: string,
  ) {
    const order =
      await this.findOrder(
        dto.orderId,
        tenantId,
      );

    if (
      order.status !==
        OrderStatus.DRAFT &&
      order.status !==
        OrderStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        'Los puntos solo pueden canjearse sobre órdenes en DRAFT o PENDING_PAYMENT.',
      );
    }

    const card =
      await this.getOrCreateLoyaltyCard(
        order.customerId,
        tenantId,
      );

    const program =
      await this.prisma.loyaltyProgram.findFirst({
        where: {
          id: card.programId,
          tenantId,
          isActive: true,
        },
      });

    if (!program) {
      throw new NotFoundException(
        'El programa de lealtad asociado a la tarjeta no está disponible.',
      );
    }

    if (
      dto.pointsToRedeem <
      program.minPointsToRedeem
    ) {
      throw new BadRequestException(
        `El canje mínimo es de ${program.minPointsToRedeem} puntos.`,
      );
    }

    const discountAmount =
      Math.round(
        dto.pointsToRedeem *
          Number(program.pointsValueClp),
      );

    return this.prisma.$transaction(
      async (tx) => {
        const existingTransaction =
          await tx.loyaltyTransaction.findFirst({
            where: {
              tenantId,
              cardId: card.id,
              orderId: order.id,
              type: 'REDEEMED',
            },
          });

        if (existingTransaction) {
          throw new ConflictException(
            'Ya existe un canje de puntos registrado para esta orden.',
          );
        }

        const debit =
          await tx.loyaltyCard.updateMany({
            where: {
              id: card.id,
              tenantId,
              currentPoints: {
                gte:
                  dto.pointsToRedeem,
              },
            },
            data: {
              currentPoints: {
                decrement:
                  dto.pointsToRedeem,
              },
              totalSpentPoints: {
                increment:
                  dto.pointsToRedeem,
              },
            },
          });

        if (debit.count !== 1) {
          throw new BadRequestException(
            `Puntos insuficientes. Saldo disponible menor a ${dto.pointsToRedeem} puntos.`,
          );
        }

        const updatedCard =
          await tx.loyaltyCard.findUnique({
            where: {
              id: card.id,
            },
          });

        if (!updatedCard) {
          throw new NotFoundException(
            'La tarjeta de lealtad no fue encontrada.',
          );
        }

        const transaction =
          await tx.loyaltyTransaction.create({
            data: {
              tenantId,
              cardId: card.id,
              orderId: order.id,
              points:
                -dto.pointsToRedeem,
              type: 'REDEEMED',
              description:
                `Canje de ${dto.pointsToRedeem} puntos por $${discountAmount.toLocaleString(
                  'es-CL',
                )} de descuento en la orden ${order.id}`,
            },
          });

        return {
          card: updatedCard,
          orderId: order.id,
          pointsRedeemed:
            dto.pointsToRedeem,
          discountAmount,
          transaction,
        };
      },
    );
  }
}