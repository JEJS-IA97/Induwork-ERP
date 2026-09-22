import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreatePriceListDto } from '../dto/create-price-list.dto';
import { BulkPriceAdjustmentDto } from '../dto/bulk-price-adjustment.dto';
import { PriceAdjustmentType } from '@prisma/client';

@Injectable()
export class PriceListsService {
  private readonly logger = new Logger(PriceListsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listar todas las listas de precios de la empresa
   */
  async findAll(tenantId: string) {
    return this.prisma.priceList.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: {
            items: true,
            customers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener detalle de una lista de precios con todos sus productos e ítems
   */
  async findOne(id: string, tenantId: string) {
    const priceList = await this.prisma.priceList.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                price: true,
                cost: true,
              },
            },
            variant: {
              select: {
                id: true,
                sku: true,
                name: true,
                price: true,
              },
            },
          },
        },
      },
    });

    if (!priceList) {
      throw new NotFoundException(`Lista de precios con ID '${id}' no encontrada.`);
    }

    return priceList;
  }

  /**
   * Crear nueva lista de precios
   */
  async create(dto: CreatePriceListDto, tenantId: string) {
    const existing = await this.prisma.priceList.findFirst({
      where: { tenantId, code: dto.code.toUpperCase() },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una lista de precios con el código '${dto.code}'.`,
      );
    }

    if (dto.isDefault) {
      // Desmarcar lista por defecto previa
      await this.prisma.priceList.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.priceList.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        currency: dto.currency || 'CLP',
        isDefault: dto.isDefault || false,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
  }

  /**
   * Asignar o modificar precio de un producto en una lista específica
   */
  async assignItemPrice(
    priceListId: string,
    productId: string,
    variantId: string | null,
    fixedPrice: number,
    percentAdjustment: number | null,
    tenantId: string,
  ) {
    await this.findOne(priceListId, tenantId);

    return this.prisma.priceListItem.upsert({
      where: {
        tenantId_priceListId_productId_variantId_minQuantity: {
          tenantId,
          priceListId,
          productId,
          variantId: variantId || (null as any),
          minQuantity: 1,
        },
      },
      update: {
        fixedPrice,
        percentAdjustment,
      },
      create: {
        tenantId,
        priceListId,
        productId,
        variantId,
        fixedPrice,
        percentAdjustment,
        minQuantity: 1,
      },
    });
  }

  /**
   * Modificación masiva de precios (aumento %, descuento %, fijación masiva)
   * Puede aplicarse sobre el catálogo general o sobre una lista de precios específica.
   */
  async bulkPriceAdjustment(
    dto: BulkPriceAdjustmentDto,
    tenantId: string,
    userId?: string,
  ) {
    const {
      priceListId,
      adjustmentType,
      value,
      categoryId,
      productIds,
      applyToBaseProducts = false,
    } = dto;

    const whereProduct: any = { tenantId, isActive: true };
    if (categoryId) whereProduct.categoryId = categoryId;
    if (productIds && productIds.length > 0) whereProduct.id = { in: productIds };

    const products = await this.prisma.product.findMany({
      where: whereProduct,
      include: { variants: true },
    });

    if (products.length === 0) {
      throw new NotFoundException('No se encontraron productos que coincidan con los filtros.');
    }

    return this.prisma.$transaction(async (tx) => {
      let updatedCount = 0;

      for (const product of products) {
        let newPrice = Number(product.price);

        if (adjustmentType === PriceAdjustmentType.PERCENTAGE_INCREASE) {
          newPrice = newPrice * (1 + value / 100);
        } else if (adjustmentType === PriceAdjustmentType.PERCENTAGE_DISCOUNT) {
          newPrice = newPrice * (1 - value / 100);
        } else if (adjustmentType === PriceAdjustmentType.FIXED_PRICE) {
          newPrice = value;
        }

        newPrice = Math.round(newPrice);

        if (applyToBaseProducts || !priceListId) {
          // Actualizar precio base del producto
          await tx.product.update({
            where: { id: product.id },
            data: { price: newPrice },
          });

          // Actualizar variantes si existen
          for (const variant of product.variants) {
            let variantPrice = Number(variant.price || product.price);
            if (adjustmentType === PriceAdjustmentType.PERCENTAGE_INCREASE) {
              variantPrice = variantPrice * (1 + value / 100);
            } else if (adjustmentType === PriceAdjustmentType.PERCENTAGE_DISCOUNT) {
              variantPrice = variantPrice * (1 - value / 100);
            } else if (adjustmentType === PriceAdjustmentType.FIXED_PRICE) {
              variantPrice = value;
            }
            await tx.productVariant.update({
              where: { id: variant.id },
              data: { price: Math.round(variantPrice) },
            });
          }
        } else if (priceListId) {
          // Actualizar o insertar en PriceListItem
          await tx.priceListItem.upsert({
            where: {
              tenantId_priceListId_productId_variantId_minQuantity: {
                tenantId,
                priceListId,
                productId: product.id,
                variantId: null as any,
                minQuantity: 1,
              },
            },
            update: {
              fixedPrice: newPrice,
              percentAdjustment: value,
              adjustmentType,
            },
            create: {
              tenantId,
              priceListId,
              productId: product.id,
              fixedPrice: newPrice,
              percentAdjustment: value,
              adjustmentType,
              minQuantity: 1,
            },
          });
        }

        updatedCount++;
      }

      // Registro de Auditoría Inmutable
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'BULK_PRICE_ADJUSTMENT',
          entityName: priceListId ? 'PriceList' : 'ProductCatalog',
          entityId: priceListId || 'BASE_CATALOG',
          newValues: {
            adjustmentType,
            value,
            productsAffected: updatedCount,
            categoryId,
          },
        },
      });

      return {
        success: true,
        message: `Modificación masiva completada exitosamente en ${updatedCount} productos.`,
        productsAffected: updatedCount,
        adjustmentType,
        value,
      };
    });
  }
}
