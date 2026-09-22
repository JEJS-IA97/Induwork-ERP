import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateReorderingRuleDto, CreateVendorPriceDto } from '../dto/reordering-rule.dto';

@Injectable()
export class ReorderingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea o actualiza una regla de reabastecimiento automático */
  async upsertRule(dto: CreateReorderingRuleDto, tenantId: string) {
    return this.prisma.reorderingRule.upsert({
      where: {
        tenantId_productId_variantId_warehouseLocation: {
          tenantId,
          productId: dto.productId,
          variantId: dto.variantId || '',
          warehouseLocation: dto.warehouseLocation || 'BODEGA_CENTRAL',
        },
      },
      create: {
        tenantId,
        productId: dto.productId,
        variantId: dto.variantId || null,
        warehouseLocation: dto.warehouseLocation || 'BODEGA_CENTRAL',
        minStock: dto.minStock,
        maxStock: dto.maxStock,
        qtyToOrder: dto.qtyToOrder,
        preferredSupplierId: dto.preferredSupplierId || null,
        isActive: dto.isActive ?? true,
      },
      update: {
        minStock: dto.minStock,
        maxStock: dto.maxStock,
        qtyToOrder: dto.qtyToOrder,
        preferredSupplierId: dto.preferredSupplierId || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAllRules(tenantId: string) {
    return this.prisma.reorderingRule.findMany({
      where: { tenantId, isActive: true },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        variant: { select: { id: true, sku: true, name: true } },
        preferredSupplier: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Evalúa todas las reglas activas del tenant y retorna los productos
   * que están bajo el stock mínimo → candidatos a generar una Orden de Compra
   */
  async evaluateAndGetAlerts(tenantId: string) {
    const rules = await this.prisma.reorderingRule.findMany({
      where: { tenantId, isActive: true },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        variant: { select: { id: true, sku: true, name: true } },
        preferredSupplier: { select: { id: true, name: true, rutOrTaxId: true } },
      },
    });

    const alerts: Array<{
      rule: typeof rules[0];
      currentStock: number;
      suggestedOrder: number;
    }> = [];

    for (const rule of rules) {
      const stock = await this.prisma.inventoryStock.findFirst({
        where: {
          tenantId,
          productId: rule.productId,
          variantId: rule.variantId || null,
          warehouseLocation: rule.warehouseLocation,
        },
      });

      const current = stock?.currentStock ?? 0;

      if (current <= rule.minStock) {
        alerts.push({
          rule,
          currentStock: current,
          suggestedOrder: rule.qtyToOrder,
        });
      }
    }

    return {
      total: alerts.length,
      alerts,
    };
  }

  // ── Listas de precios de proveedores ────────────────────────────────────────

  async upsertVendorPrice(dto: CreateVendorPriceDto, tenantId: string) {
    return this.prisma.vendorProductPrice.upsert({
      where: {
        tenantId_supplierId_productId_variantId_minQuantity: {
          tenantId,
          supplierId: dto.supplierId,
          productId: dto.productId,
          variantId: dto.variantId || '',
          minQuantity: dto.minQuantity || 1,
        },
      },
      create: {
        tenantId,
        supplierId: dto.supplierId,
        productId: dto.productId,
        variantId: dto.variantId || null,
        supplierSku: dto.supplierSku,
        unitCost: dto.unitCost,
        minQuantity: dto.minQuantity || 1,
        deliveryLeadDays: dto.deliveryLeadDays || 3,
        currency: dto.currency || 'CLP',
      },
      update: {
        supplierSku: dto.supplierSku,
        unitCost: dto.unitCost,
        deliveryLeadDays: dto.deliveryLeadDays || 3,
        currency: dto.currency || 'CLP',
      },
    });
  }

  async findVendorPrices(tenantId: string, productId?: string) {
    return this.prisma.vendorProductPrice.findMany({
      where: { tenantId, ...(productId && { productId }) },
      include: {
        supplier: { select: { id: true, name: true, rutOrTaxId: true } },
        product: { select: { id: true, sku: true, name: true } },
        variant: { select: { id: true, sku: true, name: true } },
      },
      orderBy: [{ productId: 'asc' }, { unitCost: 'asc' }],
    });
  }
}
