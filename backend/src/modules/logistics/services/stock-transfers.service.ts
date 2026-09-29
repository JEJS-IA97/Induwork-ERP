import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateStockTransferDto } from '../dto/create-stock-transfer.dto';
import { StockMovementType, TransferStatus } from '@prisma/client';

@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea una transferencia entre bodegas en estado DRAFT */
  async create(
    dto: CreateStockTransferDto,
    tenantId: string,
    createdById: string,
  ) {
    if (dto.sourceWarehouse === dto.destinationWarehouse) {
      throw new BadRequestException(
        'La bodega de origen y de destino no pueden ser iguales.',
      );
    }

    // Generar numeración correlativa TRF-YYYY-NNNNN
    const year = new Date().getFullYear();
    const lastTransfer = await this.prisma.stockTransfer.findFirst({
      where: {
        tenantId,
        transferNumber: { startsWith: `TRF-${year}-` },
      },
      orderBy: { createdAt: 'desc' },
    });

    const nextSeq = lastTransfer
      ? parseInt(lastTransfer.transferNumber.split('-')[2], 10) + 1
      : 1;
    const transferNumber = `TRF-${year}-${String(nextSeq).padStart(5, '0')}`;

    return this.prisma.stockTransfer.create({
      data: {
        tenantId,
        transferNumber,
        sourceWarehouse: dto.sourceWarehouse,
        destinationWarehouse: dto.destinationWarehouse,
        status: TransferStatus.DRAFT,
        createdById,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            lotSerialId: item.lotSerialId || null,
            quantityRequested: item.quantityRequested,
            quantitySent: 0,
            quantityReceived: 0,
          })),
        },
      },
      include: { items: true },
    });
  }

  /**
   * Ejecuta la transferencia de forma atómica:
   * - Descuenta stock en bodega origen
   * - Incrementa stock en bodega destino
   * - Registra movimientos Kardex (SALIDA en origen, ENTRADA en destino)
   * - Actualiza estado a COMPLETED
   */
  async execute(id: string, tenantId: string, executedById: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });

    if (!transfer) {
      throw new NotFoundException(`Transferencia de stock ${id} no encontrada.`);
    }

    if (transfer.status !== TransferStatus.DRAFT) {
      throw new BadRequestException(
        `Solo se pueden ejecutar transferencias en estado DRAFT. Estado actual: ${transfer.status}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      for (const item of transfer.items) {
        const resolvedVariantId = item.variantId || null;

        // 1. Validar y descontar stock origen
        const originStock = await tx.inventoryStock.findFirst({
          where: {
            tenantId,
            productId: item.productId,
            variantId: resolvedVariantId,
            warehouseLocation: transfer.sourceWarehouse,
          },
        });

        if (!originStock || originStock.currentStock < item.quantityRequested) {
          throw new BadRequestException(
            `Stock insuficiente en ${transfer.sourceWarehouse} para el producto ${item.productId}. ` +
              `Disponible: ${originStock?.currentStock ?? 0}, requerido: ${item.quantityRequested}.`,
          );
        }

        await tx.inventoryStock.update({
          where: { id: originStock.id },
          data: { currentStock: { decrement: item.quantityRequested } },
        });

        // 2. Incrementar o crear stock en bodega destino
        let destStock = await tx.inventoryStock.findFirst({
          where: {
            tenantId,
            productId: item.productId,
            variantId: resolvedVariantId,
            warehouseLocation: transfer.destinationWarehouse,
          },
        });

        if (!destStock) {
          destStock = await tx.inventoryStock.create({
            data: {
              tenantId,
              productId: item.productId,
              variantId: resolvedVariantId,
              warehouseLocation: transfer.destinationWarehouse,
              currentStock: item.quantityRequested,
            },
          });
        } else {
          await tx.inventoryStock.update({
            where: { id: destStock.id },
            data: { currentStock: { increment: item.quantityRequested } },
          });
        }

        // 3. Actualizar cantidades en ítem de transferencia
        await tx.stockTransferItem.update({
          where: { id: item.id },
          data: {
            quantitySent: item.quantityRequested,
            quantityReceived: item.quantityRequested,
          },
        });

        // 4. Kardex SALIDA en origen
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            variantId: resolvedVariantId,
            warehouseLocation: transfer.sourceWarehouse,
            type: StockMovementType.SALIDA,
            quantity: item.quantityRequested,
            reference: `Transferencia ${transfer.transferNumber} — salida hacia ${transfer.destinationWarehouse}`,
            createdById: executedById,
          },
        });

        // 5. Kardex ENTRADA en destino
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            variantId: resolvedVariantId,
            warehouseLocation: transfer.destinationWarehouse,
            type: StockMovementType.ENTRADA,
            quantity: item.quantityRequested,
            reference: `Transferencia ${transfer.transferNumber} — recepción desde ${transfer.sourceWarehouse}`,
            createdById: executedById,
          },
        });
      }

      // Marcar transferencia como COMPLETED
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: TransferStatus.COMPLETED,
          dispatchedAt: now,
          receivedAt: now,
        },
      });
    });

    return this.findOne(id, tenantId);
  }

  async findAll(tenantId: string) {
    return this.prisma.stockTransfer.findMany({
      where: { tenantId },
      include: {
        _count: { select: { items: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true } },
            variant: { select: { id: true, sku: true, name: true } },
            lotSerial: true,
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        dispatchGuide: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Transferencia de stock ${id} no encontrada.`);
    }

    return transfer;
  }

  async cancel(id: string, tenantId: string) {
    const transfer = await this.findOne(id, tenantId);

    if (transfer.status === TransferStatus.COMPLETED) {
      throw new BadRequestException(
        'No se puede cancelar una transferencia ya completada.',
      );
    }

    if (transfer.status === TransferStatus.CANCELLED) {
      throw new BadRequestException('La transferencia ya fue cancelada.');
    }

    return this.prisma.stockTransfer.update({
      where: { id },
      data: { status: TransferStatus.CANCELLED },
    });
  }
}
