import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { EarnPointsDto, RedeemPointsDto } from '../dto/loyalty-points.dto';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtener o inicializar tarjeta de lealtad de un cliente
   */
  async getOrCreateLoyaltyCard(customerId: string, tenantId: string) {
    let program = await this.prisma.loyaltyProgram.findFirst({
      where: { tenantId, isActive: true },
    });

    if (!program) {
      program = await this.prisma.loyaltyProgram.create({
        data: {
          tenantId,
          name: 'Programa de Lealtad y Puntos Corporativo',
          pointsPerSpent: 1.0, // 1 punto por cada $1.000 CLP
          minPointsToRedeem: 100,
          pointsValueClp: 10.0, // 100 puntos = $1.000 CLP de descuento
        },
      });
    }

    let card = await this.prisma.loyaltyCard.findFirst({
      where: { tenantId, customerId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!card) {
      const cardNumber = `CARD-${Date.now().toString().slice(-6)}`;
      card = await this.prisma.loyaltyCard.create({
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
   * Acumular puntos por compra realizada e incrementar contador de compras
   */
  async earnPoints(dto: EarnPointsDto, tenantId: string) {
    const card = await this.getOrCreateLoyaltyCard(dto.customerId, tenantId);
    const pointsToEarn = Math.floor(dto.purchaseAmount / 1000); // 1 punto por cada $1.000

    return this.prisma.$transaction(async (tx) => {
      const updatedCard = await tx.loyaltyCard.update({
        where: { id: card.id },
        data: {
          currentPoints: { increment: pointsToEarn },
          totalEarnedPoints: { increment: pointsToEarn },
          totalPurchasesCount: { increment: 1 },
        },
      });

      const transaction = await tx.loyaltyTransaction.create({
        data: {
          tenantId,
          cardId: card.id,
          orderId: dto.orderId,
          points: pointsToEarn,
          type: 'EARNED',
          description: `Puntos ganados por compra de $${Math.round(
            dto.purchaseAmount,
          ).toLocaleString('es-CL')}`,
        },
      });

      return {
        card: updatedCard,
        pointsEarned: pointsToEarn,
        transaction,
      };
    });
  }

  /**
   * Canjear puntos acumulados por descuento monetario
   */
  async redeemPoints(dto: RedeemPointsDto, tenantId: string) {
    const card = await this.getOrCreateLoyaltyCard(dto.customerId, tenantId);

    if (card.currentPoints < dto.pointsToRedeem) {
      throw new BadRequestException(
        `Puntos insuficientes. Saldo actual: ${card.currentPoints} puntos, solicitados: ${dto.pointsToRedeem}`,
      );
    }

    const discountAmount = dto.pointsToRedeem * 10; // Cada punto = $10 CLP

    return this.prisma.$transaction(async (tx) => {
      const updatedCard = await tx.loyaltyCard.update({
        where: { id: card.id },
        data: {
          currentPoints: { decrement: dto.pointsToRedeem },
          totalSpentPoints: { increment: dto.pointsToRedeem },
        },
      });

      const transaction = await tx.loyaltyTransaction.create({
        data: {
          tenantId,
          cardId: card.id,
          orderId: dto.orderId,
          points: -dto.pointsToRedeem,
          type: 'REDEEMED',
          description: `Canje de ${dto.pointsToRedeem} puntos por $${discountAmount.toLocaleString(
            'es-CL',
          )} de descuento`,
        },
      });

      return {
        card: updatedCard,
        pointsRedeemed: dto.pointsToRedeem,
        discountAmount,
        transaction,
      };
    });
  }
}
