import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateGoodsReceiptDto } from '../dto/create-goods-receipt.dto';
import {
  CustomerType,
  GoodsReceiptStatus,
  PurchaseOrderStatus,
  StockMovementType,
  LotSerialType,
} from '@prisma/client';

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    dto: CreateGoodsReceiptDto,
    tenantId: string,
    userId: string,
  ) {
    if (
      !dto.poId
    ) {
      throw new BadRequestException(
        'Una recepción de mercadería debe estar vinculada a una orden de compra.',
      );
    }

    if (
      !dto.items ||
      dto.items.length === 0
    ) {
      throw new BadRequestException(
        'La recepción debe contener al menos un producto.',
      );
    }

    const supplier =
      await this.prisma.customer.findFirst({
        where: {
          id: dto.supplierId,
          tenantId,
          isActive: true,
          type: {
            in: [
              CustomerType.PROVEEDOR,
              CustomerType.AMBOS,
            ],
          },
        },
      });

    if (!supplier) {
      throw new NotFoundException(
        'Proveedor no encontrado o no corresponde a un proveedor activo.',
      );
    }

    const warehouseLocation =
      dto.warehouseLocation?.trim() ||
      'BODEGA_CENTRAL';

    const purchaseOrder =
      await this.prisma.purchaseOrder.findFirst({
        where: {
          id:
            dto.poId,
          tenantId,
        },
        include: {
          items: true,
        },
      });

    if (!purchaseOrder) {
      throw new NotFoundException(
        'La orden de compra indicada no existe dentro del tenant actual.',
      );
    }

    if (
      purchaseOrder.supplierId !==
      dto.supplierId
    ) {
      throw new BadRequestException(
        'El proveedor de la recepción no coincide con el proveedor de la orden de compra.',
      );
    }

    if (
      purchaseOrder.status ===
        PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'No se puede recibir mercadería de una orden de compra cancelada.',
      );
    }

    const count =
      await this.prisma.goodsReceipt.count({
        where: {
          tenantId,
        },
      });

    const year =
      new Date().getFullYear();

    const receiptNumber =
      `REC-${year}-${String(
        count + 1,
      ).padStart(4, '0')}`;

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const receipt =
            await tx.goodsReceipt.create({
              data: {
                tenantId,
                receiptNumber,
                poId:
                  purchaseOrder.id,
                supplierId:
                  dto.supplierId,
                warehouseLocation,
                status:
                  GoodsReceiptStatus.VALIDATED,
                notes:
                  dto.notes,
                validatedById:
                  userId,
              },
            });

          for (const item of dto.items) {
            const product =
              await tx.product.findFirst({
                where: {
                  id:
                    item.productId,
                  tenantId,
                  isActive: true,
                  isArchived: false,
                },
              });

            if (!product) {
              throw new NotFoundException(
                `Producto '${item.productId}' no encontrado dentro del tenant.`,
              );
            }

            let variant = null;

            if (item.variantId) {
              variant =
                await tx.productVariant.findFirst({
                  where: {
                    id:
                      item.variantId,
                    tenantId,
                    productId:
                      item.productId,
                    isActive: true,
                  },
                });

              if (!variant) {
                throw new NotFoundException(
                  `La variante '${item.variantId}' no pertenece al producto indicado.`,
                );
              }
            }

            const poItem =
              purchaseOrder.items.find(
                (entry) =>
                  entry.productId ===
                    item.productId &&
                  (
                    entry.variantId ||
                    null
                  ) ===
                    (
                      item.variantId ||
                      null
                    ),
              );

            if (!poItem) {
              throw new BadRequestException(
                `El producto '${product.name}' no existe en la orden de compra ${purchaseOrder.poNumber}.`,
              );
            }

            const remaining =
              poItem.quantity -
              poItem.receivedQuantity;

            if (
              item.quantityReceived >
              remaining
            ) {
              throw new BadRequestException(
                `La recepción de '${product.name}' excede la cantidad pendiente de la OC. Pendiente: ${remaining}, recibido: ${item.quantityReceived}.`,
              );
            }

            const unitCost =
              Math.round(
                Number(
                  poItem.unitCost,
                ),
              );

            let lotSerialId:
              | string
              | null = null;

            if (
              item.lotOrSerialNumber
            ) {
              const existingLot =
                await tx.productLotSerial.findFirst({
                  where: {
                    tenantId,
                    productId:
                      item.productId,
                    variantId:
                      item.variantId ||
                      null,
                    lotOrSerialNumber:
                      item.lotOrSerialNumber,
                  },
                });

              if (
                existingLot
              ) {
                await tx.productLotSerial.update({
                  where: {
                    id:
                      existingLot.id,
                  },
                  data: {
                    currentQuantity: {
                      increment:
                        item.quantityReceived,
                    },
                  },
                });

                lotSerialId =
                  existingLot.id;
              } else {
                const newLotSerial =
                  await tx.productLotSerial.create({
                    data: {
                      tenantId,
                      productId:
                        item.productId,
                      variantId:
                        item.variantId ||
                        null,
                      lotOrSerialNumber:
                        item.lotOrSerialNumber,
                      type:
                        LotSerialType.SERIAL,
                      initialQuantity:
                        item.quantityReceived,
                      currentQuantity:
                        item.quantityReceived,
                      warehouseLocation,
                      purchaseOrderId:
                        purchaseOrder.id,
                    },
                  });

                lotSerialId =
                  newLotSerial.id;
              }
            }

            await tx.goodsReceiptItem.create({
              data: {
                receiptId:
                  receipt.id,
                productId:
                  item.productId,
                variantId:
                  item.variantId ||
                  null,
                lotSerialId,
                quantityReceived:
                  item.quantityReceived,
                unitCost,
              },
            });

            await tx.inventoryStock.upsert({
              where: {
                tenantId_productId_warehouseLocation_variantId:
                  {
                    tenantId,
                    productId:
                      item.productId,
                    warehouseLocation,
                    variantId:
                      item.variantId ||
                      '',
                  },
              },
              create: {
                tenantId,
                productId:
                  item.productId,
                variantId:
                  item.variantId ||
                  null,
                warehouseLocation,
                currentStock:
                  item.quantityReceived,
              },
              update: {
                currentStock: {
                  increment:
                    item.quantityReceived,
                },
              },
            });

            await tx.stockMovement.create({
              data: {
                tenantId,
                productId:
                  item.productId,
                variantId:
                  item.variantId ||
                  null,
                type:
                  StockMovementType.ENTRADA,
                quantity:
                  item.quantityReceived,
                unitCost,
                warehouseLocation,
                reference:
                  `Recepción de Compra ${receiptNumber} (OC ${purchaseOrder.poNumber})`,
                createdById:
                  userId,
              },
            });

            await tx.purchaseOrderItem.update({
              where: {
                id:
                  poItem.id,
              },
              data: {
                receivedQuantity: {
                  increment:
                    item.quantityReceived,
                },
              },
            });
          }

          const allPoItems =
            await tx.purchaseOrderItem.findMany({
              where: {
                poId:
                  purchaseOrder.id,
              },
            });

          const allReceived =
            allPoItems.every(
              (entry) =>
                entry.receivedQuantity >=
                entry.quantity,
            );

          const partiallyReceived =
            allPoItems.some(
              (entry) =>
                entry.receivedQuantity > 0,
            );

          const newStatus =
            allReceived
              ? PurchaseOrderStatus.RECEIVED
              : partiallyReceived
                ? PurchaseOrderStatus.PARTIALLY_RECEIVED
                : PurchaseOrderStatus.CONFIRMED;

          await tx.purchaseOrder.update({
            where: {
              id:
                purchaseOrder.id,
            },
            data: {
              status:
                newStatus,
            },
          });

          await tx.auditLog.create({
            data: {
              tenantId,
              userId,
              action:
                'VALIDATE_GOODS_RECEIPT',
              entityName:
                'GoodsReceipt',
              entityId:
                receipt.id,
              newValues: {
                receiptNumber,
                supplier:
                  supplier.name,
                purchaseOrder:
                  purchaseOrder.poNumber,
                itemCount:
                  dto.items.length,
              },
            },
          });

          return receipt;
        },
      );

    return this.findOne(
      result.id,
      tenantId,
    );
  }

  async findAll(
    tenantId: string,
  ) {
    return this.prisma.goodsReceipt.findMany({
      where: {
        tenantId,
      },
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(
    id: string,
    tenantId: string,
  ) {
    const receipt =
      await this.prisma.goodsReceipt.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          supplier: true,
          po: true,
          validatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
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
      throw new NotFoundException(
        'Recepción de mercadería no encontrada.',
      );
    }

    return receipt;
  }
}