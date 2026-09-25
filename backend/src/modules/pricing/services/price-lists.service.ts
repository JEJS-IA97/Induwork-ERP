import {
  Injectable,
  NotFoundException,
  ConflictException,
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
   * Verifica que una lista de precios pertenezca al tenant actual.
   */
  private async validatePriceList(
    priceListId: string,
    tenantId: string,
  ) {
    const priceList = await this.prisma.priceList.findFirst({
      where: {
        id: priceListId,
        tenantId,
      },
    });

    if (!priceList) {
      throw new NotFoundException(
        `La lista de precios '${priceListId}' no pertenece al tenant actual.`,
      );
    }

    return priceList;
  }

  /**
   * Verifica que un producto pertenezca al tenant actual.
   */
  private async validateProduct(
    productId: string,
    tenantId: string,
  ) {
    const product = await this.prisma.product.findFirst({
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
   * Verifica que una variante pertenezca al tenant y al producto indicado.
   */
  private async validateVariant(
    variantId: string,
    productId: string,
    tenantId: string,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
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
   * Listar todas las listas de precios de la empresa.
   */
  async findAll(tenantId: string) {
    return this.prisma.priceList.findMany({
      where: {
        tenantId,
      },
      include: {
        _count: {
          select: {
            items: true,
            customers: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Obtener detalle de una lista de precios con todos sus productos e ítems.
   */
  async findOne(
    id: string,
    tenantId: string,
  ) {
    const priceList = await this.prisma.priceList.findFirst({
      where: {
        id,
        tenantId,
      },
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
      throw new NotFoundException(
        `Lista de precios con ID '${id}' no encontrada.`,
      );
    }

    return priceList;
  }

  /**
   * Crear nueva lista de precios.
   */
  async create(
    dto: CreatePriceListDto,
    tenantId: string,
  ) {
    const existing = await this.prisma.priceList.findFirst({
      where: {
        tenantId,
        code: dto.code.toUpperCase(),
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una lista de precios con el código '${dto.code}'.`,
      );
    }

    if (dto.isDefault) {
      await this.prisma.priceList.updateMany({
        where: {
          tenantId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
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
        startDate: dto.startDate
          ? new Date(dto.startDate)
          : null,
        endDate: dto.endDate
          ? new Date(dto.endDate)
          : null,
      },
    });
  }

  /**
   * Asignar o modificar precio de un producto en una lista específica.
   *
   * Todas las entidades relacionadas se validan dentro del tenant actual.
   */
  async assignItemPrice(
    priceListId: string,
    productId: string,
    variantId: string | null,
    fixedPrice: number,
    percentAdjustment: number | null,
    tenantId: string,
  ) {
    await this.validatePriceList(
      priceListId,
      tenantId,
    );

    const product = await this.validateProduct(
      productId,
      tenantId,
    );

    if (variantId) {
      await this.validateVariant(
        variantId,
        product.id,
        tenantId,
      );
    }

    return this.prisma.priceListItem.upsert({
      where: {
        tenantId_priceListId_productId_variantId_minQuantity: {
          tenantId,
          priceListId,
          productId,
          variantId,
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
   * Modificación masiva de precios.
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

    if (priceListId) {
      await this.validatePriceList(
        priceListId,
        tenantId,
      );
    }

    const whereProduct: {
      tenantId: string;
      isActive: boolean;
      isArchived: boolean;
      categoryId?: string;
      id?: {
        in: string[];
      };
    } = {
      tenantId,
      isActive: true,
      isArchived: false,
    };

    if (categoryId) {
      whereProduct.categoryId = categoryId;
    }

    if (productIds && productIds.length > 0) {
      whereProduct.id = {
        in: productIds,
      };
    }

    const products = await this.prisma.product.findMany({
      where: whereProduct,
      include: {
        variants: true,
      },
    });

    if (products.length === 0) {
      throw new NotFoundException(
        'No se encontraron productos que coincidan con los filtros.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let updatedCount = 0;

      for (const product of products) {
        let newPrice = Number(product.price);

        if (
          adjustmentType ===
          PriceAdjustmentType.PERCENTAGE_INCREASE
        ) {
          newPrice =
            newPrice * (1 + value / 100);
        } else if (
          adjustmentType ===
          PriceAdjustmentType.PERCENTAGE_DISCOUNT
        ) {
          newPrice =
            newPrice * (1 - value / 100);
        } else if (
          adjustmentType ===
          PriceAdjustmentType.FIXED_PRICE
        ) {
          newPrice = value;
        }

        newPrice = Math.round(newPrice);

        if (applyToBaseProducts || !priceListId) {
          await tx.product.update({
            where: {
              id: product.id,
            },
            data: {
              price: newPrice,
            },
          });

          for (const variant of product.variants) {
            let variantPrice = Number(
              variant.price || product.price,
            );

            if (
              adjustmentType ===
              PriceAdjustmentType.PERCENTAGE_INCREASE
            ) {
              variantPrice =
                variantPrice * (1 + value / 100);
            } else if (
              adjustmentType ===
              PriceAdjustmentType.PERCENTAGE_DISCOUNT
            ) {
              variantPrice =
                variantPrice * (1 - value / 100);
            } else if (
              adjustmentType ===
              PriceAdjustmentType.FIXED_PRICE
            ) {
              variantPrice = value;
            }

            await tx.productVariant.update({
              where: {
                id: variant.id,
              },
              data: {
                price: Math.round(
                  variantPrice,
                ),
              },
            });
          }
        } else {
          await tx.priceListItem.upsert({
            where: {
              tenantId_priceListId_productId_variantId_minQuantity: {
                tenantId,
                priceListId,
                productId: product.id,
                variantId: null,
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

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'BULK_PRICE_ADJUSTMENT',
          entityName: priceListId
            ? 'PriceList'
            : 'ProductCatalog',
          entityId:
            priceListId || 'BASE_CATALOG',
          newValues: {
            adjustmentType,
            value,
            productsAffected:
              updatedCount,
            categoryId,
          },
        },
      });

      return {
        success: true,
        message:
          `Modificación masiva completada exitosamente en ${updatedCount} productos.`,
        productsAffected: updatedCount,
        adjustmentType,
        value,
      };
    });
  }
}