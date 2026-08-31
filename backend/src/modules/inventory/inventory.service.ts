import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateMovementDto, StockMovementType } from './dto/create-movement.dto';

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
      warehouseLocation = 'BODEGA_CENTRAL',
      reference = 'Movimiento de inventario',
    } = createMovementDto;

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
    });

    if (!product) {
      throw new NotFoundException(`Producto no encontrado en esta empresa.`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Find or create inventory stock record
      let stock = await tx.inventoryStock.findFirst({
        where: {
          tenantId,
          productId,
          warehouseLocation,
          variantId: variantId || null,
        },
      });

      if (!stock) {
        stock = await tx.inventoryStock.create({
          data: {
            tenantId,
            productId,
            variantId: variantId || null,
            warehouseLocation,
            currentStock: 0,
          },
        });
      }

      let newStock = stock.currentStock;

      if (type === StockMovementType.ENTRADA) {
        newStock += quantity;
      } else if (type === StockMovementType.SALIDA) {
        if (stock.currentStock < quantity) {
          throw new BadRequestException(
            `Stock insuficiente en bodega '${warehouseLocation}'. Stock actual: ${stock.currentStock}, solicitado: ${quantity}`,
          );
        }
        newStock -= quantity;
      } else if (type === StockMovementType.AJUSTE) {
        newStock = quantity;
      }

      // Update stock
      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { currentStock: newStock },
      });

      // Record movement history
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          variantId: variantId || null,
          createdById: userId,
          type: type as any,
          quantity,
          warehouseLocation,
          reference,
        },
      });

      return {
        movement,
        updatedStock: {
          warehouseLocation,
          previousStock: stock.currentStock,
          currentStock: newStock,
        },
      };
    });
  }
}
