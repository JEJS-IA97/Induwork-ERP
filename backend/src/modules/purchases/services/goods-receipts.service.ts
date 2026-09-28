import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateGoodsReceiptDto } from '../dto/create-goods-receipt.dto';
import {
  Prisma,
  CustomerType,
  GoodsReceiptStatus,
  PurchaseOrderStatus,
  StockMovementType,
  LotSerialType,
} from '@prisma/client';

@Injectable()
export class GoodsReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateGoodsReceiptDto,
    tenantId: string,
    userId: string,
  ) {
    if (!dto.poId) {
      throw new BadRequestException(
        'Una recepción de mercadería debe estar vinculada a una orden de compra.',
      );
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        'La recepción debe contener al menos un producto.',
      );
    }

    const warehouseLocation =
      dto.warehouseLocation?.trim() ||
      'BODEGA_CENTRAL';

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.prisma.$transaction(
          async (tx) => {
            const purchaseOrderLockKey = [
              'PURCHASE_ORDER',
              tenantId,
              dto.poId,
            ].join(':');

            /*
             * Serializa las recepciones y los cambios de estado de la misma OC.
             */
            await tx.$queryRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${purchaseOrderLockKey}, 0)
              )
            `;

            const purchaseOrder =
              await tx.purchaseOrder.findFirst({
                where: {
                  id: dto.poId,
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

            const supplier = await tx.customer.findFirst({
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

            if (purchaseOrder.supplierId !== dto.supplierId) {
              throw new BadRequestException(
                'El proveedor de la recepción no coincide con el proveedor de la orden de compra.',
              );
            }

            if (
              purchaseOrder.status !==
                PurchaseOrderStatus.CONFIRMED &&
              purchaseOrder.status !==
                PurchaseOrderStatus.PARTIALLY_RECEIVED
            ) {
              throw new BadRequestException(
                `No se puede registrar una recepción para una orden de compra en estado '${purchaseOrder.status}'. La orden debe estar CONFIRMED o PARTIALLY_RECEIVED.`,
              );
            }

            const count = await tx.goodsReceipt.count({
              where: { tenantId },
            });

            const year = new Date().getFullYear();
            const receiptNumber =
              `REC-${year}-${String(count + 1).padStart(4, '0')}`;

            const receipt = await tx.goodsReceipt.create({
              data: {
                tenantId,
                receiptNumber,
                poId: purchaseOrder.id,
                supplierId: dto.supplierId,
                warehouseLocation,
                status: GoodsReceiptStatus.VALIDATED,
                notes: dto.notes,
                validatedById: userId,
              },
            });

            for (const item of dto.items) {
              const product = await tx.product.findFirst({
                where: {
                  id: item.productId,
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
                variant = await tx.productVariant.findFirst({
                  where: {
                    id: item.variantId,
                    tenantId,
                    productId: item.productId,
                    isActive: true,
                  },
                });

                if (!variant) {
                  throw new NotFoundException(
                    `La variante '${item.variantId}' no pertenece al producto indicado.`,
                  );
                }
              }

              const poItem = purchaseOrder.items.find(
                (entry) =>
                  entry.productId === item.productId &&
                  (entry.variantId || null) ===
                    (item.variantId || null),
              );

              if (!poItem) {
                throw new BadRequestException(
                  `El producto '${product.name}' no existe en la orden de compra ${purchaseOrder.poNumber}.`,
                );
              }

              const remaining =
                poItem.quantity - poItem.receivedQuantity;

              if (remaining <= 0) {
                throw new BadRequestException(
                  `El producto '${product.name}' ya fue recibido por completo en la orden de compra ${purchaseOrder.poNumber}.`,
                );
              }

              if (item.quantityReceived > remaining) {
                throw new BadRequestException(
                  `La recepción de '${product.name}' excede la cantidad pendiente de la OC. Pendiente: ${remaining}, recibido: ${item.quantityReceived}.`,
                );
              }

              const unitCost = Math.round(
                Number(poItem.unitCost),
              );

              let lotSerialId: string | null = null;

              if (item.lotOrSerialNumber) {
                const lotLockKey = [
                  'LOT',
                  tenantId,
                  item.productId,
                  item.variantId || 'NO_VARIANT',
                  item.lotOrSerialNumber,
                ].join(':');

                await tx.$queryRaw`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(${lotLockKey}, 0)
                  )
                `;

                const existingLot =
                  await tx.productLotSerial.findFirst({
                    where: {
                      tenantId,
                      productId: item.productId,
                      variantId: item.variantId || null,
                      lotOrSerialNumber:
                        item.lotOrSerialNumber,
                    },
                  });

                if (existingLot) {
                  await tx.productLotSerial.update({
                    where: { id: existingLot.id },
                    data: {
                      currentQuantity: {
                        increment:
                          item.quantityReceived,
                      },
                    },
                  });

                  lotSerialId = existingLot.id;
                } else {
                  const newLotSerial =
                    await tx.productLotSerial.create({
                      data: {
                        tenantId,
                        productId: item.productId,
                        variantId: item.variantId || null,
                        lotOrSerialNumber:
                          item.lotOrSerialNumber,
                        type: LotSerialType.SERIAL,
                        initialQuantity:
                          item.quantityReceived,
                        currentQuantity:
                          item.quantityReceived,
                        warehouseLocation,
                        purchaseOrderId:
                          purchaseOrder.id,
                      },
                    });

                  lotSerialId = newLotSerial.id;
                }
              }

              await tx.goodsReceiptItem.create({
                data: {
                  receiptId: receipt.id,
                  productId: item.productId,
                  variantId: item.variantId || null,
                  lotSerialId,
                  quantityReceived:
                    item.quantityReceived,
                  unitCost,
                },
              });

              const stockLockKey = [
                'STOCK',
                tenantId,
                item.productId,
                warehouseLocation,
                item.variantId || 'NO_VARIANT',
              ].join(':');

              /*
               * Usa la misma clave que InventoryService. No se utiliza upsert()
               * con el índice compuesto porque variantId es nullable y
               * PostgreSQL permite múltiples NULL en un UNIQUE convencional.
               */
              await tx.$queryRaw`
                SELECT pg_advisory_xact_lock(
                  hashtextextended(${stockLockKey}, 0)
                )
              `;

              const existingStock =
                await tx.inventoryStock.findFirst({
                  where: {
                    tenantId,
                    productId: item.productId,
                    warehouseLocation,
                    variantId: item.variantId || null,
                  },
                });

              if (existingStock) {
                await tx.inventoryStock.update({
                  where: { id: existingStock.id },
                  data: {
                    currentStock: {
                      increment:
                        item.quantityReceived,
                    },
                  },
                });
              } else {
                await tx.inventoryStock.create({
                  data: {
                    tenantId,
                    productId: item.productId,
                    variantId: item.variantId || null,
                    warehouseLocation,
                    currentStock:
                      item.quantityReceived,
                  },
                });
              }

              await tx.stockMovement.create({
                data: {
                  tenantId,
                  productId: item.productId,
                  variantId: item.variantId || null,
                  type: StockMovementType.ENTRADA,
                  quantity: item.quantityReceived,
                  unitCost,
                  warehouseLocation,
                  reference:
                    `Recepción de Compra ${receiptNumber} (OC ${purchaseOrder.poNumber})`,
                  createdById: userId,
                },
              });

              await tx.purchaseOrderItem.update({
                where: { id: poItem.id },
                data: {
                  receivedQuantity: {
                    increment:
                      item.quantityReceived,
                  },
                },
              });

              /*
               * Si el mismo PurchaseOrderItem aparece dos veces en el DTO,
               * no permitimos que ambas líneas reutilicen el mismo saldo.
               */
              poItem.receivedQuantity +=
                item.quantityReceived;
            }

            const allPoItems =
              await tx.purchaseOrderItem.findMany({
                where: { poId: purchaseOrder.id },
              });

            const allReceived = allPoItems.every(
              (entry) =>
                entry.receivedQuantity >=
                entry.quantity,
            );

            const partiallyReceived =
              allPoItems.some(
                (entry) =>
                  entry.receivedQuantity > 0,
              );

            const newStatus = allReceived
              ? PurchaseOrderStatus.RECEIVED
              : partiallyReceived
                ? PurchaseOrderStatus.PARTIALLY_RECEIVED
                : PurchaseOrderStatus.CONFIRMED;

            await tx.purchaseOrder.update({
              where: { id: purchaseOrder.id },
              data: { status: newStatus },
            });

            await tx.auditLog.create({
              data: {
                tenantId,
                userId,
                action: 'VALIDATE_GOODS_RECEIPT',
                entityName: 'GoodsReceipt',
                entityId: receipt.id,
                oldValues: {
                  purchaseOrderStatus:
                    purchaseOrder.status,
                },
                newValues: {
                  receiptNumber,
                  supplier: supplier.name,
                  purchaseOrder:
                    purchaseOrder.poNumber,
                  itemCount: dto.items.length,
                  purchaseOrderStatus: newStatus,
                },
              },
            });

            return receipt;
          },
          {
            maxWait: 5000,
            timeout: 15000,
          },
        );

        return this.findOne(result.id, tenantId);
      } catch (error) {
        const isKnownPrismaError =
          error instanceof Prisma.PrismaClientKnownRequestError;

        const isUniqueConflict =
          isKnownPrismaError &&
          error.code === 'P2002';

        if (isUniqueConflict && attempt < maxAttempts) {
          continue;
        }

        if (isUniqueConflict) {
          throw new ConflictException(
            'No fue posible completar la recepción por un conflicto de numeración o registro concurrente. Intente nuevamente.',
          );
        }

        throw error;
      }
    }

    throw new ConflictException(
      'No fue posible completar la recepción. Intente nuevamente.',
    );
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
