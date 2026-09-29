import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateDispatchGuideDto } from '../dto/create-dispatch-guide.dto';
import {
  DispatchGuideStatus,
  DispatchType,
  StockMovementType,
} from '@prisma/client';

@Injectable()
export class DispatchGuideService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea una guía de despacho y descuenta el stock si es VENTA o TRASLADO_INTERNO */
  async create(
    dto: CreateDispatchGuideDto,
    tenantId: string,
    createdById: string,
  ) {
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, tenantId },
      });
      if (!order) {
        throw new NotFoundException(
          `Orden de venta ${dto.orderId} no encontrada en el tenant.`,
        );
      }
    }

    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId },
      });
      if (!customer) {
        throw new NotFoundException(
          `Cliente ${dto.customerId} no encontrado en el tenant.`,
        );
      }
    }

    // Generar numeración correlativa GD-YYYY-NNNNN
    const year = new Date().getFullYear();
    const lastGuide = await this.prisma.dispatchGuide.findFirst({
      where: {
        tenantId,
        guideNumber: { startsWith: `GD-${year}-` },
      },
      orderBy: { createdAt: 'desc' },
    });

    const nextSeq = lastGuide
      ? parseInt(lastGuide.guideNumber.split('-')[2], 10) + 1
      : 1;
    const guideNumber = `GD-${year}-${String(nextSeq).padStart(5, '0')}`;

    const originWarehouse = dto.originWarehouse || 'BODEGA_CENTRAL';

    // Crear la guía en una transacción junto a los movimientos de stock
    const guide = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dispatchGuide.create({
        data: {
          tenantId,
          guideNumber,
          dispatchType: dto.dispatchType,
          status: DispatchGuideStatus.DRAFT,
          orderId: dto.orderId || null,
          transferId: dto.transferId || null,
          customerId: dto.customerId || null,
          originWarehouse,
          destinationWarehouse: dto.destinationWarehouse || null,
          destinationAddress: dto.destinationAddress || null,
          carrierRut: dto.carrierRut || null,
          carrierName: dto.carrierName || null,
          vehiclePlate: dto.vehiclePlate || null,
          driverName: dto.driverName || null,
          driverRut: dto.driverRut || null,
          items: {
            create: dto.items.map((item) => {
              const unitPrice = item.unitPrice ?? 0;
              return {
                productId: item.productId,
                variantId: item.variantId || null,
                lotSerialId: item.lotSerialId || null,
                quantity: item.quantity,
                unitPrice,
                subtotal: unitPrice * item.quantity,
              };
            }),
          },
        },
        include: { items: true },
      });

      // Descontar stock cuando el tipo de despacho implica salida física
      const typesWithStockOut: DispatchType[] = [
        DispatchType.VENTA,
        DispatchType.TRASLADO_INTERNO,
      ];

      if (typesWithStockOut.includes(dto.dispatchType)) {
        for (const item of dto.items) {
          const resolvedVariantId = item.variantId || null;
          const stock = await tx.inventoryStock.findFirst({
            where: {
              tenantId,
              productId: item.productId,
              variantId: resolvedVariantId,
              warehouseLocation: originWarehouse,
            },
          });

          if (!stock || stock.currentStock < item.quantity) {
            throw new BadRequestException(
              `Stock insuficiente en ${originWarehouse} para el producto ${item.productId}. ` +
                `Disponible: ${stock?.currentStock ?? 0}, requerido: ${item.quantity}.`,
            );
          }

          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { currentStock: { decrement: item.quantity } },
          });

          // Registrar salida en Kardex
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              variantId: resolvedVariantId,
              warehouseLocation: originWarehouse,
              type: StockMovementType.SALIDA,
              quantity: item.quantity,
              reference: `Guía de Despacho DTE 52: ${guideNumber}`,
              createdById,
            },
          });
        }
      }

      return created;
    });

    return guide;
  }

  async findAll(tenantId: string) {
    return this.prisma.dispatchGuide.findMany({
      where: { tenantId },
      include: {
        customer: { select: { id: true, name: true, rutOrTaxId: true } },
        order: { select: { id: true, orderNumber: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const guide = await this.prisma.dispatchGuide.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true } },
            variant: { select: { id: true, sku: true, name: true } },
            lotSerial: true,
          },
        },
        customer: true,
        order: { select: { id: true, orderNumber: true, status: true } },
        transfer: true,
      },
    });

    if (!guide) {
      throw new NotFoundException(`Guía de despacho ${id} no encontrada.`);
    }

    return guide;
  }

  /** Emite formalmente la guía de despacho (DRAFT → ISSUED) */
  async issue(id: string, tenantId: string) {
    const guide = await this.findOne(id, tenantId);

    if (guide.status !== DispatchGuideStatus.DRAFT) {
      throw new BadRequestException(
        `Solo se pueden emitir guías en estado DRAFT. Estado actual: ${guide.status}.`,
      );
    }

    return this.prisma.dispatchGuide.update({
      where: { id },
      data: {
        status: DispatchGuideStatus.ISSUED,
        issuedAt: new Date(),
      },
    });
  }

  /** Anula una guía de despacho (DRAFT/ISSUED → VOID) */
  async voidGuide(id: string, tenantId: string) {
    const guide = await this.findOne(id, tenantId);

    if (guide.status === DispatchGuideStatus.DELIVERED) {
      throw new BadRequestException(
        'No se puede anular una guía que ya fue entregada.',
      );
    }

    if (guide.status === DispatchGuideStatus.VOID) {
      throw new BadRequestException('La guía ya fue anulada previamente.');
    }

    return this.prisma.dispatchGuide.update({
      where: { id },
      data: { status: DispatchGuideStatus.VOID },
    });
  }

  /** Alias para anular guía */
  async cancel(id: string, tenantId: string) {
    return this.voidGuide(id, tenantId);
  }
}
