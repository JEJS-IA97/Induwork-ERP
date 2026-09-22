import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateVendorBillDto } from '../dto/create-vendor-bill.dto';
import { VendorBillStatus, ThreeWayMatchStatus } from '@prisma/client';

@Injectable()
export class ThreeWayMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una Factura de Proveedor y ejecuta la validación cruzada 3-Way Matching
   */
  async createAndValidateBill(
    dto: CreateVendorBillDto,
    tenantId: string,
    userId: string,
  ) {
    // 1. Validar que no exista la factura duplicada para el mismo proveedor
    const existing = await this.prisma.vendorBill.findUnique({
      where: {
        tenantId_supplierId_billNumber: {
          tenantId,
          supplierId: dto.supplierId,
          billNumber: dto.billNumber,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Ya existe una factura registrada con el folio '${dto.billNumber}' para este proveedor.`,
      );
    }

    // 2. Ejecutar algoritmo de 3-Way Matching
    let matchStatus: ThreeWayMatchStatus = ThreeWayMatchStatus.NOT_MATCHED;
    const discrepancies: string[] = [];

    // Si tiene Orden de Compra vinculada
    if (dto.poId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.poId, tenantId },
        include: { items: true },
      });

      if (po) {
        // Validar discrepancia de monto total (tolerancia de $100 CLP por redondeo)
        const poTotal = Number(po.totalAmount);
        const billTotal = dto.totalAmount;
        const diffAmount = Math.abs(poTotal - billTotal);

        if (diffAmount > 100) {
          discrepancies.push(
            `Diferencia en Monto Total: OC $${poTotal.toLocaleString('es-CL')} vs Factura $${billTotal.toLocaleString('es-CL')} (Dif: $${diffAmount.toLocaleString('es-CL')})`,
          );
        }
      }
    }

    // Si tiene Recepción de Bodega vinculada
    if (dto.receiptId) {
      const receipt = await this.prisma.goodsReceipt.findFirst({
        where: { id: dto.receiptId, tenantId },
        include: { items: true },
      });

      if (receipt) {
        // Validar que la recepción esté validada
        if (receipt.status !== 'VALIDATED') {
          discrepancies.push(
            `La recepción de bodega ${receipt.receiptNumber} aún no está validada.`,
          );
        }
      }
    }

    // Determinar resultado final
    if (dto.poId || dto.receiptId) {
      if (discrepancies.length === 0) {
        matchStatus = ThreeWayMatchStatus.MATCHED;
      } else {
        matchStatus = ThreeWayMatchStatus.DISCREPANCY;
      }
    }

    // 3. Crear la Factura de Proveedor
    const bill = await this.prisma.vendorBill.create({
      data: {
        tenantId,
        billNumber: dto.billNumber,
        supplierId: dto.supplierId,
        poId: dto.poId || null,
        receiptId: dto.receiptId || null,
        dteType: dto.dteType || 33,
        status: VendorBillStatus.DRAFT,
        matchStatus,
        matchDiscrepancyNotes:
          discrepancies.length > 0 ? discrepancies.join(' | ') : null,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        subtotalAmount: dto.subtotalAmount,
        taxAmount: dto.taxAmount,
        totalAmount: dto.totalAmount,
        pdfUrl: dto.pdfUrl,
        xmlUrl: dto.xmlUrl,
      },
      include: {
        supplier: true,
        po: true,
        receipt: true,
      },
    });

    // 4. Auditoría
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'CREATE_VENDOR_BILL_3WAY_MATCH',
        entityName: 'VendorBill',
        entityId: bill.id,
        newValues: {
          billNumber: bill.billNumber,
          supplierId: bill.supplierId,
          matchStatus: bill.matchStatus,
          discrepancies: discrepancies.length,
        },
      },
    });

    return bill;
  }

  async findAllBills(tenantId: string) {
    return this.prisma.vendorBill.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        po: true,
        receipt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneBill(id: string, tenantId: string) {
    const bill = await this.prisma.vendorBill.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        po: {
          include: { items: true },
        },
        receipt: {
          include: { items: true },
        },
      },
    });

    if (!bill) {
      throw new NotFoundException('Factura de proveedor no encontrada.');
    }

    return bill;
  }

  async approveBill(id: string, tenantId: string, userId: string) {
    const bill = await this.findOneBill(id, tenantId);

    const updated = await this.prisma.vendorBill.update({
      where: { id: bill.id },
      data: { status: VendorBillStatus.POSTED },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'APPROVE_VENDOR_BILL',
        entityName: 'VendorBill',
        entityId: bill.id,
        oldValues: { status: bill.status },
        newValues: { status: VendorBillStatus.POSTED },
      },
    });

    return updated;
  }
}
