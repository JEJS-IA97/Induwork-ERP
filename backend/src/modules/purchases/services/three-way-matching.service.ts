import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateVendorBillDto } from '../dto/create-vendor-bill.dto';
import {
  CustomerType,
  VendorBillStatus,
  ThreeWayMatchStatus,
  GoodsReceiptStatus,
} from '@prisma/client';

@Injectable()
export class ThreeWayMatchingService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Registra una Factura de Proveedor y ejecuta
   * la validación cruzada 3-Way Matching.
   */
  async createAndValidateBill(
    dto: CreateVendorBillDto,
    tenantId: string,
    userId: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException(
        'El tenant es obligatorio.',
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
        'El proveedor indicado no existe dentro del tenant actual.',
      );
    }

    const existing =
      await this.prisma.vendorBill.findUnique({
        where: {
          tenantId_supplierId_billNumber: {
            tenantId,
            supplierId:
              dto.supplierId,
            billNumber:
              dto.billNumber,
          },
        },
      });

    if (existing) {
      throw new BadRequestException(
        `Ya existe una factura registrada con el folio '${dto.billNumber}' para este proveedor.`,
      );
    }

    const subtotalAmount =
      Math.round(
        dto.subtotalAmount,
      );

    const taxAmount =
      Math.round(
        dto.taxAmount,
      );

    const totalAmount =
      Math.round(
        dto.totalAmount,
      );

    if (
      !Number.isInteger(
        subtotalAmount,
      ) ||
      !Number.isInteger(
        taxAmount,
      ) ||
      !Number.isInteger(
        totalAmount,
      )
    ) {
      throw new BadRequestException(
        'Los montos de la factura deben expresarse como pesos enteros.',
      );
    }

    if (
      subtotalAmount +
        taxAmount !==
      totalAmount
    ) {
      throw new BadRequestException(
        'El subtotal más el IVA no coincide con el total de la factura de proveedor.',
      );
    }

    /*
     * Cast explícito para evitar que TypeScript
     * estreche el valor inicial a "NOT_MATCHED".
     */
    let matchStatus =
      ThreeWayMatchStatus.NOT_MATCHED as ThreeWayMatchStatus;

    const discrepancies: string[] =
      [];

    let po = null;
    let receipt = null;

    /*
     * --------------------------------------------------------------------------
     * 1. VALIDAR ORDEN DE COMPRA
     * --------------------------------------------------------------------------
     */
    if (dto.poId) {
      po =
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

      if (!po) {
        throw new NotFoundException(
          'La orden de compra indicada no existe dentro del tenant actual.',
        );
      }

      if (
        po.supplierId !==
        dto.supplierId
      ) {
        throw new BadRequestException(
          'El proveedor de la factura no coincide con el proveedor de la orden de compra.',
        );
      }

      if (
        po.status ===
        'CANCELLED'
      ) {
        throw new BadRequestException(
          'No se puede procesar una factura contra una orden de compra cancelada.',
        );
      }

      const poTotal =
        Math.round(
          Number(
            po.totalAmount,
          ),
        );

      if (
        poTotal !==
        totalAmount
      ) {
        const difference =
          Math.abs(
            poTotal -
              totalAmount,
          );

        discrepancies.push(
          `Diferencia en Monto Total: OC $${poTotal.toLocaleString('es-CL')} vs Factura $${totalAmount.toLocaleString('es-CL')} (Dif: $${difference.toLocaleString('es-CL')}).`,
        );
      }
    }

    /*
     * --------------------------------------------------------------------------
     * 2. VALIDAR RECEPCIÓN DE MERCADERÍA
     * --------------------------------------------------------------------------
     */
    if (dto.receiptId) {
      receipt =
        await this.prisma.goodsReceipt.findFirst({
          where: {
            id:
              dto.receiptId,
            tenantId,
          },
          include: {
            items: true,
          },
        });

      if (!receipt) {
        throw new NotFoundException(
          'La recepción indicada no existe dentro del tenant actual.',
        );
      }

      if (
        receipt.supplierId !==
        dto.supplierId
      ) {
        throw new BadRequestException(
          'El proveedor de la factura no coincide con el proveedor de la recepción.',
        );
      }

      if (
        receipt.status !==
        GoodsReceiptStatus.VALIDATED
      ) {
        discrepancies.push(
          `La recepción de bodega ${receipt.receiptNumber} no está validada.`,
        );
      }

      if (
        po &&
        receipt.poId !==
          po.id
      ) {
        discrepancies.push(
          'La recepción de mercadería no corresponde a la orden de compra indicada.',
        );
      }
    }

    /*
     * --------------------------------------------------------------------------
     * 3. VALIDAR QUE EXISTA EL 3-WAY MATCH COMPLETO
     * --------------------------------------------------------------------------
     */
    if (!dto.poId && !dto.receiptId) {
      matchStatus =
        ThreeWayMatchStatus.NOT_MATCHED;
    } else if (!dto.poId || !dto.receiptId) {
      discrepancies.push(
        'El 3-Way Matching requiere una Orden de Compra y una Recepción de Mercadería.',
      );

      matchStatus =
        ThreeWayMatchStatus.DISCREPANCY;
    } else if (
      po &&
      receipt
    ) {
      /*
       * ------------------------------------------------------------------------
       * 4. COMPARAR CANTIDADES OC VS RECEPCIÓN
       * ------------------------------------------------------------------------
       */
      const receivedByProduct =
        new Map<string, number>();

      for (
        const receiptItem of receipt.items
      ) {
        const key =
          `${receiptItem.productId}:${receiptItem.variantId || ''}`;

        const current =
          receivedByProduct.get(
            key,
          ) || 0;

        receivedByProduct.set(
          key,
          current +
            receiptItem.quantityReceived,
        );
      }

      for (
        const poItem of po.items
      ) {
        const key =
          `${poItem.productId}:${poItem.variantId || ''}`;

        const received =
          receivedByProduct.get(
            key,
          ) || 0;

        if (
          received <
          poItem.quantity
        ) {
          discrepancies.push(
            `Cantidad pendiente para el producto ${poItem.productId}: OC ${poItem.quantity}, recibido ${received}.`,
          );
        }

        if (
          received >
          poItem.quantity
        ) {
          discrepancies.push(
            `Cantidad recibida superior a la OC para el producto ${poItem.productId}: OC ${poItem.quantity}, recibido ${received}.`,
          );
        }
      }

      /*
       * Detectar productos recibidos que no existen en la OC.
       */
      for (
        const receiptItem of receipt.items
      ) {
        const matchingPoItem =
          po.items.find(
            (poItem) =>
              poItem.productId ===
                receiptItem.productId &&
              (
                poItem.variantId ||
                null
              ) ===
                (
                  receiptItem.variantId ||
                  null
                ),
          );

        if (!matchingPoItem) {
          discrepancies.push(
            `El producto ${receiptItem.productId} recibido no forma parte de la orden de compra ${po.poNumber}.`,
          );
        }
      }

      /*
       * Resultado final del matching.
       */
      if (
        discrepancies.length ===
        0
      ) {
        matchStatus =
          ThreeWayMatchStatus.MATCHED;
      } else {
        matchStatus =
          ThreeWayMatchStatus.DISCREPANCY;
      }
    }

    /*
     * --------------------------------------------------------------------------
     * 5. CREAR FACTURA DE PROVEEDOR
     * --------------------------------------------------------------------------
     */
    const bill =
      await this.prisma.vendorBill.create({
        data: {
          tenantId,
          billNumber:
            dto.billNumber,
          supplierId:
            dto.supplierId,
          poId:
            dto.poId ||
            null,
          receiptId:
            dto.receiptId ||
            null,
          dteType:
            dto.dteType ||
            33,
          status:
            VendorBillStatus.DRAFT,
          matchStatus,
          matchDiscrepancyNotes:
            discrepancies.length >
            0
              ? discrepancies.join(
                  ' | ',
                )
              : null,
          issueDate:
            dto.issueDate
              ? new Date(
                  dto.issueDate,
                )
              : new Date(),
          dueDate:
            dto.dueDate
              ? new Date(
                  dto.dueDate,
                )
              : null,
          subtotalAmount,
          taxAmount,
          totalAmount,
          pdfUrl:
            dto.pdfUrl,
          xmlUrl:
            dto.xmlUrl,
        },
        include: {
          supplier: true,
          po: true,
          receipt: true,
        },
      });

    /*
     * --------------------------------------------------------------------------
     * 6. AUDITORÍA
     * --------------------------------------------------------------------------
     */
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action:
          'CREATE_VENDOR_BILL_3WAY_MATCH',
        entityName:
          'VendorBill',
        entityId:
          bill.id,
        newValues: {
          billNumber:
            bill.billNumber,
          supplierId:
            bill.supplierId,
          matchStatus:
            bill.matchStatus,
          discrepancies:
            discrepancies.length,
        },
      },
    });

    return bill;
  }

  async findAllBills(
    tenantId: string,
  ) {
    return this.prisma.vendorBill.findMany({
      where: {
        tenantId,
      },
      include: {
        supplier: true,
        po: true,
        receipt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOneBill(
    id: string,
    tenantId: string,
  ) {
    const bill =
      await this.prisma.vendorBill.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          supplier: true,
          po: {
            include: {
              items: true,
            },
          },
          receipt: {
            include: {
              items: true,
            },
          },
        },
      });

    if (!bill) {
      throw new NotFoundException(
        'Factura de proveedor no encontrada.',
      );
    }

    return bill;
  }

  async approveBill(
    id: string,
    tenantId: string,
    userId: string,
  ) {
    const bill =
      await this.findOneBill(
        id,
        tenantId,
      );

    if (
      bill.status !==
      VendorBillStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Solo se pueden aprobar facturas de proveedor en estado DRAFT.',
      );
    }

    if (
      bill.matchStatus !==
      ThreeWayMatchStatus.MATCHED
    ) {
      throw new BadRequestException(
        'La factura de proveedor no puede contabilizarse porque el 3-Way Matching no está en estado MATCHED.',
      );
    }

    const updated =
      await this.prisma.vendorBill.update({
        where: {
          id:
            bill.id,
        },
        data: {
          status:
            VendorBillStatus.POSTED,
        },
      });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action:
          'APPROVE_VENDOR_BILL',
        entityName:
          'VendorBill',
        entityId:
          bill.id,
        oldValues: {
          status:
            bill.status,
          matchStatus:
            bill.matchStatus,
        },
        newValues: {
          status:
            VendorBillStatus.POSTED,
        },
      },
    });

    return updated;
  }
}