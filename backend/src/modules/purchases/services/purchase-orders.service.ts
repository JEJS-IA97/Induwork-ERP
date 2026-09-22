import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import { PurchaseOrderStatus } from '@prisma/client';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePurchaseOrderDto, tenantId: string, userId: string) {
    // 1. Validar que el proveedor exista en el tenant
    const supplier = await this.prisma.customer.findFirst({
      where: {
        id: dto.supplierId,
        tenantId,
        type: { in: ['PROVEEDOR', 'AMBOS'] },
      },
    });

    if (!supplier) {
      throw new NotFoundException(
        'El proveedor indicado no existe o no tiene perfil de proveedor.',
      );
    }

    // 2. Generar número correlativo de OC si no viene dado
    let poNumber = dto.poNumber;
    if (!poNumber) {
      const count = await this.prisma.purchaseOrder.count({
        where: { tenantId },
      });
      const year = new Date().getFullYear();
      poNumber = `OC-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    // 3. Calcular montos
    let subtotalAmount = 0;
    let taxAmount = 0;

    const itemsData = dto.items.map((item) => {
      const itemTaxRate = item.taxRate !== undefined ? item.taxRate : 19.0;
      const itemSubtotal = item.quantity * item.unitCost;
      const itemTax = itemSubtotal * (itemTaxRate / 100);
      const itemTotal = itemSubtotal + itemTax;

      subtotalAmount += itemSubtotal;
      taxAmount += itemTax;

      return {
        productId: item.productId,
        variantId: item.variantId || null,
        productName: item.productName,
        quantity: item.quantity,
        unitCost: item.unitCost,
        taxRate: itemTaxRate,
        subtotal: itemSubtotal,
        total: itemTotal,
      };
    });

    const totalAmount = subtotalAmount + taxAmount;

    // 4. Crear la Orden de Compra
    const po = await this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        poNumber,
        supplierId: dto.supplierId,
        status: dto.status || PurchaseOrderStatus.RFQ,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        notes: dto.notes,
        subtotalAmount,
        taxAmount,
        totalAmount,
        createdById: userId,
        items: {
          create: itemsData,
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

    // 5. Auditoría
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'CREATE_PURCHASE_ORDER',
        entityName: 'PurchaseOrder',
        entityId: po.id,
        newValues: {
          poNumber: po.poNumber,
          supplier: supplier.name,
          totalAmount: po.totalAmount,
        },
      },
    });

    return po;
  }

  async findAll(tenantId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { tenantId },
      include: {
        supplier: {
          select: { id: true, name: true, rutOrTaxId: true, email: true },
        },
        items: true,
        goodsReceipts: true,
        vendorBills: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
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
      throw new NotFoundException(`Orden de compra no encontrada.`);
    }

    return po;
  }

  async updateStatus(
    id: string,
    status: PurchaseOrderStatus,
    tenantId: string,
    userId: string,
  ) {
    const po = await this.findOne(id, tenantId);

    const updated = await this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status },
      include: {
        supplier: true,
        items: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'UPDATE_PURCHASE_ORDER_STATUS',
        entityName: 'PurchaseOrder',
        entityId: po.id,
        oldValues: { status: po.status },
        newValues: { status },
      },
    });

    return updated;
  }
}
