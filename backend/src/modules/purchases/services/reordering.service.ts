import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  CreateReorderingRuleDto,
  CreateVendorPriceDto,
} from '../dto/reordering-rule.dto';
import { CustomerType } from '@prisma/client';

@Injectable()
export class ReorderingService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Valida que el producto pertenezca al tenant actual.
   */
  private async validateProduct(
    productId: string,
    tenantId: string,
  ) {
    const product =
      await this.prisma.product.findFirst({
        where: {
          id: productId,
          tenantId,
          isActive: true,
          isArchived: false,
        },
      });

    if (!product) {
      throw new NotFoundException(
        `El producto '${productId}' no pertenece al tenant actual o está inactivo.`,
      );
    }

    return product;
  }

  /**
   * Valida que la variante pertenezca al tenant y producto indicados.
   */
  private async validateVariant(
    variantId: string,
    productId: string,
    tenantId: string,
  ) {
    const variant =
      await this.prisma.productVariant.findFirst({
        where: {
          id: variantId,
          tenantId,
          productId,
          isActive: true,
        },
      });

    if (!variant) {
      throw new NotFoundException(
        `La variante '${variantId}' no pertenece al producto indicado o al tenant actual.`,
      );
    }

    return variant;
  }

  /**
   * Valida que el proveedor:
   * - pertenezca al tenant actual
   * - esté activo
   * - tenga perfil PROVEEDOR o AMBOS
   */
  private async validateSupplier(
    supplierId: string,
    tenantId: string,
  ) {
    const supplier =
      await this.prisma.customer.findFirst({
        where: {
          id: supplierId,
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
        `El proveedor '${supplierId}' no pertenece al tenant actual o no tiene un perfil de proveedor válido.`,
      );
    }

    return supplier;
  }

  /**
   * Crea o actualiza una regla de reabastecimiento automático.
   */
  async upsertRule(
    dto: CreateReorderingRuleDto,
    tenantId: string,
  ) {
    const product =
      await this.validateProduct(
        dto.productId,
        tenantId,
      );

    if (dto.variantId) {
      await this.validateVariant(
        dto.variantId,
        product.id,
        tenantId,
      );
    }

    if (dto.preferredSupplierId) {
      await this.validateSupplier(
        dto.preferredSupplierId,
        tenantId,
      );
    }

    const warehouseLocation =
      dto.warehouseLocation ||
      'BODEGA_CENTRAL';

    const variantId =
      dto.variantId || null;

    return this.prisma.reorderingRule.upsert({
      where: {
        tenantId_productId_variantId_warehouseLocation: {
          tenantId,
          productId: product.id,
          variantId,
          warehouseLocation,
        },
      },
      create: {
        tenantId,
        productId: product.id,
        variantId,
        warehouseLocation,
        minStock: dto.minStock,
        maxStock: dto.maxStock,
        qtyToOrder: dto.qtyToOrder,
        preferredSupplierId:
          dto.preferredSupplierId || null,
        isActive:
          dto.isActive ?? true,
      },
      update: {
        minStock: dto.minStock,
        maxStock: dto.maxStock,
        qtyToOrder: dto.qtyToOrder,
        preferredSupplierId:
          dto.preferredSupplierId || null,
        isActive:
          dto.isActive ?? true,
      },
    });
  }

  async findAllRules(
    tenantId: string,
  ) {
    return this.prisma.reorderingRule.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
        preferredSupplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Evalúa todas las reglas activas del tenant y retorna
   * los productos que están bajo el stock mínimo.
   */
  async evaluateAndGetAlerts(
    tenantId: string,
  ) {
    const rules =
      await this.prisma.reorderingRule.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
            },
          },
          variant: {
            select: {
              id: true,
              sku: true,
              name: true,
            },
          },
          preferredSupplier: {
            select: {
              id: true,
              name: true,
              rutOrTaxId: true,
            },
          },
        },
      });

    const alerts: Array<{
      rule: (typeof rules)[number];
      currentStock: number;
      suggestedOrder: number;
    }> = [];

    for (const rule of rules) {
      const stock =
        await this.prisma.inventoryStock.findFirst({
          where: {
            tenantId,
            productId: rule.productId,
            variantId:
              rule.variantId || null,
            warehouseLocation:
              rule.warehouseLocation,
          },
        });

      const current =
        stock?.currentStock ?? 0;

      if (
        current <= rule.minStock
      ) {
        alerts.push({
          rule,
          currentStock: current,
          suggestedOrder:
            rule.qtyToOrder,
        });
      }
    }

    return {
      total: alerts.length,
      alerts,
    };
  }

  /**
   * Crea o actualiza un precio de proveedor.
   *
   * Supplier, product y variant deben pertenecer
   * al mismo tenant.
   */
  async upsertVendorPrice(
    dto: CreateVendorPriceDto,
    tenantId: string,
  ) {
    const product =
      await this.validateProduct(
        dto.productId,
        tenantId,
      );

    await this.validateSupplier(
      dto.supplierId,
      tenantId,
    );

    if (dto.variantId) {
      await this.validateVariant(
        dto.variantId,
        product.id,
        tenantId,
      );
    }

    const variantId =
      dto.variantId || null;

    const minQuantity =
      dto.minQuantity || 1;

    return this.prisma.vendorProductPrice.upsert({
      where: {
        tenantId_supplierId_productId_variantId_minQuantity: {
          tenantId,
          supplierId:
            dto.supplierId,
          productId: product.id,
          variantId,
          minQuantity,
        },
      },
      create: {
        tenantId,
        supplierId:
          dto.supplierId,
        productId: product.id,
        variantId,
        supplierSku:
          dto.supplierSku,
        unitCost:
          dto.unitCost,
        minQuantity,
        deliveryLeadDays:
          dto.deliveryLeadDays || 3,
        currency:
          dto.currency || 'CLP',
      },
      update: {
        supplierSku:
          dto.supplierSku,
        unitCost:
          dto.unitCost,
        deliveryLeadDays:
          dto.deliveryLeadDays || 3,
        currency:
          dto.currency || 'CLP',
      },
    });
  }

  async findVendorPrices(
    tenantId: string,
    productId?: string,
  ) {
    if (productId) {
      await this.validateProduct(
        productId,
        tenantId,
      );
    }

    return this.prisma.vendorProductPrice.findMany({
      where: {
        tenantId,
        ...(productId
          ? { productId }
          : {}),
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            rutOrTaxId: true,
          },
        },
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
      orderBy: [
        {
          productId: 'asc',
        },
        {
          unitCost: 'asc',
        },
      ],
    });
  }
}