import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateGoodsReceiptDto } from '../dto/create-goods-receipt.dto';
import {
  GoodsReceiptStatus,
  PurchaseOrderStatus,
  StockMovementType,
  LotSerialType,
} from '@prisma/client';

@Injectable()
export class GoodsReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateGoodsReceiptDto, tenantId: string, userId: string) {
    // 1. Validar proveedor
    const supplier = await this.prisma.customer.findFirst({
      where: { id: dto.supplierId, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado.');
    }

    // 2. Generar correlativo de recepción
    const count = await this.prisma.goodsReceipt.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    const receiptNumber = `REC-${year}-${String(count + 1).padStart(4, '0')}`;
    const warehouseLocation = dto.warehouseLocation || 'BODEGA_CENTRAL';

    // 3. Crear recepción de mercadería y actualizar inventario en transacción
    const result = await this.prisma.$transaction(async (tx) => {
      // a) Crear la cabecera de recepción
      const receipt = await tx.goodsReceipt.create({
        data: {
          tenantId,
          receiptNumber,
          poId: dto.poId || null,
          supplierId: dto.supplierId,
          warehouseLocation,
          status: GoodsReceiptStatus.VALIDATED,
          notes: dto.notes,
          validatedById: userId,
        },
      });

      // b) Procesar cada ítem recibido
      for (const item of dto.items) {
        let lotSerialId: string | null = null;

        // Si se suministró número de serie o lote, registrar/vincular
        if (item.lotOrSerialNumber) {
          const lotSerial = await tx.productLotSerial.upsert({
            where: {
              tenantId_productId_variantId_lotOrSerialNumber: {
                tenantId,
                productId: item.productId,
                variantId: item.variantId || '',
                lotOrSerialNumber: item.lotOrSerialNumber,
              },
            },
            create: {
              tenantId,
              productId: item.productId,
              variantId: item.variantId || null,
              lotOrSerialNumber: item.lotOrSerialNumber,
              type: LotSerialType.SERIAL,
              initialQuantity: item.quantityReceived,
              currentQuantity: item.quantityReceived,
              warehouseLocation,
              purchaseOrderId: dto.poId || null,
            },
            update: {
              currentQuantity: { increment: item.quantityReceived },
            },
          });
          lotSerialId = lotSerial.id;
        }

        // Crear registro en goods_receipt_items
        await tx.goodsReceiptItem.create({
          data: {
            receiptId: receipt.id,
            productId: item.productId,
            variantId: item.variantId || null,
            lotSerialId,
            quantityReceived: item.quantityReceived,
            unitCost: item.unitCost,
          },
        });

        // Actualizar o crear existencia en Bodega (InventoryStock)
        await tx.inventoryStock.upsert({
          where: {
            tenantId_productId_warehouseLocation_variantId: {
              tenantId,
              productId: item.productId,
              warehouseLocation,
              variantId: item.variantId || '',
            },
          },
          create: {
            tenantId,
            productId: item.productId,
            variantId: item.variantId || null,
            warehouseLocation,
            currentStock: item.quantityReceived,
          },
          update: {
            currentStock: { increment: item.quantityReceived },
          },
        });

        // Registrar movimiento de Kardex (ENTRADA)
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            variantId: item.variantId || null,
            type: StockMovementType.ENTRADA,
            quantity: item.quantityReceived,
            unitCost: item.unitCost,
            warehouseLocation,
            reference: `Recepción de Compra ${receiptNumber}${dto.poId ? ' (OC vinculada)' : ''}`,
            createdById: userId,
          },
        });

        // Si viene de una OC, actualizar cantidades recibidas
        if (dto.poId) {
          const poItem = await tx.purchaseOrderItem.findFirst({
            where: {
              poId: dto.poId,
              productId: item.productId,
              variantId: item.variantId || null,
            },
          });

          if (poItem) {
            await tx.purchaseOrderItem.update({
              where: { id: poItem.id },
              data: {
                receivedQuantity: { increment: item.quantityReceived },
              },
            });
          }
        }
      }

      // c) Si viene de una OC, evaluar si se completó la entrega
      if (dto.poId) {
        const allPoItems = await tx.purchaseOrderItem.findMany({
          where: { poId: dto.poId },
        });

        const allReceived = allPoItems.every(
          (pi) => pi.receivedQuantity >= pi.quantity,
        );
        const partiallyReceived = allPoItems.some(
          (pi) => pi.receivedQuantity > 0,
        );

        const newStatus = allReceived
          ? PurchaseOrderStatus.RECEIVED
          : partiallyReceived
            ? PurchaseOrderStatus.PARTIALLY_RECEIVED
            : PurchaseOrderStatus.CONFIRMED;

        await tx.purchaseOrder.update({
          where: { id: dto.poId },
          data: { status: newStatus },
        });
      }

      // d) Auditoría
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'VALIDATE_GOODS_RECEIPT',
          entityName: 'GoodsReceipt',
          entityId: receipt.id,
          newValues: {
            receiptNumber,
            supplier: supplier.name,
            itemCount: dto.items.length,
          },
        },
      });

      return receipt;
    });

    return this.findOne(result.id, tenantId);
  }

  async findAll(tenantId: string) {
    return this.prisma.goodsReceipt.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        po: true,
        items: {
          include: {
            product: true,
            variant: true,
            lotSerial: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const receipt = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        po: true,
        validatedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          include: {
            product: true,
            variant: true,
            lotSerial: true,
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Recepción de mercadería no encontrada.`);
    }

    return receipt;
  }
}
