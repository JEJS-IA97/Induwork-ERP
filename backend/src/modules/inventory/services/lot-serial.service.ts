import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateLotSerialDto } from '../dto/create-lot-serial.dto';
import { LotSerialType } from '@prisma/client';

@Injectable()
export class LotSerialService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra un nuevo número de serie o lote para un producto */
  async create(dto: CreateLotSerialDto, tenantId: string) {
    // 1. Validar que el producto exista en el tenant
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId },
    });
    if (!product) {
      throw new NotFoundException(
        `Producto ${dto.productId} no encontrado en el tenant.`,
      );
    }

    const resolvedVariantId = dto.variantId || null;

    // 2. Validar unicidad dentro del tenant
    const existing = await this.prisma.productLotSerial.findFirst({
      where: {
        tenantId,
        productId: dto.productId,
        variantId: resolvedVariantId,
        lotOrSerialNumber: dto.lotOrSerialNumber,
      },
    });

    if (existing) {
      throw new ConflictException(
        `El lote/serie '${dto.lotOrSerialNumber}' ya se encuentra registrado para este producto.`,
      );
    }

    const qty = dto.initialQuantity ?? 1;

    return this.prisma.productLotSerial.create({
      data: {
        tenantId,
        productId: dto.productId,
        variantId: resolvedVariantId,
        lotOrSerialNumber: dto.lotOrSerialNumber,
        type: dto.type || LotSerialType.SERIAL,
        initialQuantity: qty,
        currentQuantity: qty,
        warehouseLocation: dto.warehouseLocation || 'BODEGA_CENTRAL',
        expirationDate: dto.expirationDate
          ? new Date(dto.expirationDate)
          : null,
        warrantyEndDate: dto.warrantyEndDate
          ? new Date(dto.warrantyEndDate)
          : null,
        purchaseOrderId: dto.purchaseOrderId || null,
      },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        variant: { select: { id: true, sku: true, name: true } },
      },
    });
  }

  async findAll(
    tenantId: string,
    productId?: string,
    type?: LotSerialType,
  ) {
    return this.prisma.productLotSerial.findMany({
      where: {
        tenantId,
        ...(productId && { productId }),
        ...(type && { type }),
      },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        variant: { select: { id: true, sku: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const lotSerial = await this.prisma.productLotSerial.findFirst({
      where: { id, tenantId },
      include: {
        product: true,
        variant: true,
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            supplier: { select: { name: true, rutOrTaxId: true } },
          },
        },
      },
    });

    if (!lotSerial) {
      throw new NotFoundException(`Lote/Serie ${id} no encontrado.`);
    }

    return lotSerial;
  }

  /**
   * Trazabilidad Completa 360° del Lote o Serie:
   * - Recepciones de compra donde ingresó
   * - Transferencias entre bodegas donde se trasladó
   * - Guías de despacho hacia clientes donde se entregó
   */
  async getTraceability(id: string, tenantId: string) {
    const lot = await this.findOne(id, tenantId);

    const [receipts, transfers, dispatchGuides] = await Promise.all([
      this.prisma.goodsReceiptItem.findMany({
        where: { lotSerialId: id },
        include: {
          receipt: {
            select: {
              receiptNumber: true,
              receivedAt: true,
              warehouseLocation: true,
              supplier: { select: { name: true, rutOrTaxId: true } },
            },
          },
        },
      }),
      this.prisma.stockTransferItem.findMany({
        where: { lotSerialId: id },
        include: {
          transfer: {
            select: {
              transferNumber: true,
              sourceWarehouse: true,
              destinationWarehouse: true,
              status: true,
              dispatchedAt: true,
              receivedAt: true,
            },
          },
        },
      }),
      this.prisma.dispatchGuideItem.findMany({
        where: { lotSerialId: id },
        include: {
          guide: {
            select: {
              guideNumber: true,
              dispatchType: true,
              status: true,
              issuedAt: true,
              deliveredAt: true,
              customer: { select: { name: true, rutOrTaxId: true } },
            },
          },
        },
      }),
    ]);

    return {
      lotSerial: {
        id: lot.id,
        lotOrSerialNumber: lot.lotOrSerialNumber,
        type: lot.type,
        product: lot.product.name,
        sku: lot.product.sku,
        currentQuantity: lot.currentQuantity,
        warehouseLocation: lot.warehouseLocation,
        expirationDate: lot.expirationDate,
        warrantyEndDate: lot.warrantyEndDate,
      },
      traceability: {
        goodsReceipts: receipts.map((r) => ({
          receiptNumber: r.receipt.receiptNumber,
          supplier: r.receipt.supplier.name,
          warehouseLocation: r.receipt.warehouseLocation,
          quantityReceived: r.quantityReceived,
          receivedAt: r.receipt.receivedAt,
        })),
        stockTransfers: transfers.map((t) => ({
          transferNumber: t.transfer.transferNumber,
          from: t.transfer.sourceWarehouse,
          to: t.transfer.destinationWarehouse,
          status: t.transfer.status,
          quantityRequested: t.quantityRequested,
          quantityReceived: t.quantityReceived,
          dispatchedAt: t.transfer.dispatchedAt,
          receivedAt: t.transfer.receivedAt,
        })),
        dispatchGuides: dispatchGuides.map((d) => ({
          guideNumber: d.guide.guideNumber,
          dispatchType: d.guide.dispatchType,
          status: d.guide.status,
          customer: d.guide.customer?.name ?? 'Sin cliente asignado',
          quantityDispatched: d.quantity,
          issuedAt: d.guide.issuedAt,
          deliveredAt: d.guide.deliveredAt,
        })),
      },
    };
  }
}
