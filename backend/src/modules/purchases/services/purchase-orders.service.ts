import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import {
  CustomerType,
  PurchaseOrderStatus,
} from '@prisma/client';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    dto: CreatePurchaseOrderDto,
    tenantId: string,
    userId: string,
  ) {
    if (
      !dto.items ||
      dto.items.length === 0
    ) {
      throw new BadRequestException(
        'La orden de compra debe contener al menos un ítem.',
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
        'El proveedor indicado no existe o no tiene perfil de proveedor.',
      );
    }

    let poNumber =
      dto.poNumber?.trim();

    if (!poNumber) {
      const count =
        await this.prisma.purchaseOrder.count({
          where: {
            tenantId,
          },
        });

      const year =
        new Date().getFullYear();

      poNumber =
        `OC-${year}-${String(
          count + 1,
        ).padStart(4, '0')}`;
    }

    let subtotalAmount = 0;
    let taxAmount = 0;

    const itemsData = [];

    for (const item of dto.items) {
      const product =
        await this.prisma.product.findFirst({
          where: {
            id: item.productId,
            tenantId,
            isActive: true,
            isArchived: false,
          },
        });

      if (!product) {
        throw new NotFoundException(
          `Producto '${item.productId}' no encontrado dentro del tenant actual.`,
        );
      }

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
            `La variante '${item.variantId}' no pertenece al producto indicado.`,
          );
        }
      }

      const unitCost =
        Math.round(item.unitCost);

      if (
        !Number.isInteger(unitCost) ||
        unitCost < 0
      ) {
        throw new BadRequestException(
          `El costo del producto '${product.name}' es inválido.`,
        );
      }

      const itemTaxRate =
        item.taxRate !== undefined
          ? item.taxRate
          : 19;

      if (
        !Number.isFinite(
          itemTaxRate,
        ) ||
        itemTaxRate < 0 ||
        itemTaxRate > 100
      ) {
        throw new BadRequestException(
          `La tasa de impuesto del producto '${product.name}' es inválida.`,
        );
      }

      const itemSubtotal =
        Math.round(
          item.quantity *
          unitCost,
        );

      const itemTax =
        Math.round(
          itemSubtotal *
          (itemTaxRate / 100),
        );

      const itemTotal =
        itemSubtotal +
        itemTax;

      subtotalAmount +=
        itemSubtotal;

      taxAmount +=
        itemTax;

      itemsData.push({
        productId:
          product.id,
        variantId:
          variant?.id || null,
        productName:
          product.orderName ||
          product.name,
        quantity:
          item.quantity,
        unitCost,
        taxRate:
          itemTaxRate,
        subtotal:
          itemSubtotal,
        total:
          itemTotal,
      });
    }

    const totalAmount =
      subtotalAmount +
      taxAmount;

    const po =
      await this.prisma.purchaseOrder.create({
        data: {
          tenantId,
          poNumber,
          supplierId:
            dto.supplierId,
          status:
            dto.status ||
            PurchaseOrderStatus.RFQ,
          expectedDate:
            dto.expectedDate
              ? new Date(
                  dto.expectedDate,
                )
              : null,
          notes:
            dto.notes,
          subtotalAmount,
          taxAmount,
          totalAmount,
          createdById:
            userId,
          items: {
            create:
              itemsData,
          },
        },
        include: {
          supplier: true,
          items: {
            include: {
              product: true,
              variant: true,
            },
          },
        },
      });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action:
          'CREATE_PURCHASE_ORDER',
        entityName:
          'PurchaseOrder',
        entityId:
          po.id,
        newValues: {
          poNumber:
            po.poNumber,
          supplier:
            supplier.name,
          totalAmount:
            po.totalAmount,
        },
      },
    });

    return po;
  }

  async findAll(
    tenantId: string,
  ) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        tenantId,
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            rutOrTaxId: true,
            email: true,
          },
        },
        items: true,
        goodsReceipts: true,
        vendorBills: true,
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
    const po =
      await this.prisma.purchaseOrder.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          supplier: true,
          createdBy: {
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
            },
          },
          goodsReceipts: {
            include: {
              items: true,
            },
          },
          vendorBills: true,
        },
      });

    if (!po) {
      throw new NotFoundException(
        'Orden de compra no encontrada.',
      );
    }

    return po;
  }

  async updateStatus(
    id: string,
    status: PurchaseOrderStatus,
    tenantId: string,
    userId: string,
  ) {
    const po =
      await this.findOne(
        id,
        tenantId,
      );

    if (
      po.status ===
        PurchaseOrderStatus.CANCELLED &&
      status !==
        PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Una orden de compra cancelada no puede reabrirse mediante este endpoint.',
      );
    }

    const updated =
      await this.prisma.purchaseOrder.update({
        where: {
          id: po.id,
        },
        data: {
          status,
        },
        include: {
          supplier: true,
          items: true,
        },
      });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action:
          'UPDATE_PURCHASE_ORDER_STATUS',
        entityName:
          'PurchaseOrder',
        entityId:
          po.id,
        oldValues: {
          status:
            po.status,
        },
        newValues: {
          status,
        },
      },
    });

    return updated;
  }
}