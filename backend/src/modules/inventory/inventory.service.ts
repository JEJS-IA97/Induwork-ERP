import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { StockMovementType as PrismaStockMovementType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateMovementDto,
  StockMovementType,
} from './dto/create-movement.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getStockByTenant(tenantId: string) {
    return this.prisma.inventoryStock.findMany({
      where: { tenantId },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getMovements(tenantId: string) {
    return this.prisma.stockMovement.findMany({
      where: { tenantId },
      include: {
        product: {
          select: {
            sku: true,
            name: true,
          },
        },
        variant: {
          select: {
            sku: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async registerMovement(
    createMovementDto: CreateMovementDto,
    tenantId: string,
    userId?: string,
  ) {
    const {
      productId,
      variantId,
      type,
      quantity,
      reference = 'Movimiento de inventario',
    } = createMovementDto;

    const warehouseLocation =
      createMovementDto.warehouseLocation?.trim() ||
      'BODEGA_CENTRAL';

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        tenantId,
        isActive: true,
        isArchived: false,
      },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException(
        'Producto no encontrado o no disponible en esta empresa.',
      );
    }

    let resolvedVariantId: string | null = variantId || null;

    if (variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: {
          id: variantId,
          tenantId,
          productId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!variant) {
        throw new NotFoundException(
          'La variante no pertenece al producto y tenant actuales, o está inactiva.',
        );
      }

      resolvedVariantId = variant.id;
    }

    const inventoryLockKey = [
      'STOCK',
      tenantId,
      productId,
      warehouseLocation,
      resolvedVariantId ?? 'NO_VARIANT',
    ].join(':');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${inventoryLockKey}, 0)
        )
      `;

      let stock = await tx.inventoryStock.findFirst({
        where: {
          tenantId,
          productId,
          warehouseLocation,
          variantId: resolvedVariantId,
        },
      });

      if (!stock) {
        stock = await tx.inventoryStock.create({
          data: {
            tenantId,
            productId,
            variantId: resolvedVariantId,
            warehouseLocation,
            currentStock: 0,
          },
        });
      }

      const previousStock = stock.currentStock;
      let newStock: number;

      switch (type) {
        case StockMovementType.ENTRADA:
          newStock = previousStock + quantity;
          break;

        case StockMovementType.SALIDA:
          if (previousStock < quantity) {
            throw new BadRequestException(
              `Stock insuficiente en bodega '${warehouseLocation}'. Stock actual: ${previousStock}, solicitado: ${quantity}`,
            );
          }
          newStock = previousStock - quantity;
          break;

        case StockMovementType.AJUSTE:
          newStock = quantity;
          break;

        default:
          throw new BadRequestException(
            'Tipo de movimiento de inventario no válido.',
          );
      }

      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { currentStock: newStock },
      });

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          variantId: resolvedVariantId,
          createdById: userId,
          type: type as PrismaStockMovementType,
          quantity,
          warehouseLocation,
          reference,
        },
      });

      return {
        movement,
        updatedStock: {
          warehouseLocation,
          previousStock,
          currentStock: newStock,
        },
      };
    });
  }
}
