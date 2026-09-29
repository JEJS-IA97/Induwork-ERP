import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateBomDto, AssembleKitDto } from '../dto/create-bom.dto';
import { BomType, StockMovementType } from '@prisma/client';

@Injectable()
export class BomService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea una nueva Lista de Materiales / Kit (BOM) */
  async create(dto: CreateBomDto, tenantId: string) {
    // 1. Validar producto padre
    const parentProduct = await this.prisma.product.findFirst({
      where: { id: dto.parentProductId, tenantId },
    });
    if (!parentProduct) {
      throw new NotFoundException(
        `Producto padre ${dto.parentProductId} no encontrado en el tenant.`,
      );
    }

    // 2. Validar que el código no exista previamente
    const existingCode = await this.prisma.billOfMaterials.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existingCode) {
      throw new ConflictException(
        `Ya existe una lista de materiales con el código '${dto.code}'.`,
      );
    }

    // 3. Validar componentes (que existan y no generen auto-referencia directa)
    for (const comp of dto.components) {
      if (comp.componentProductId === dto.parentProductId) {
        throw new BadRequestException(
          'Un producto no puede ser componente de sí mismo.',
        );
      }

      const compProduct = await this.prisma.product.findFirst({
        where: { id: comp.componentProductId, tenantId },
      });
      if (!compProduct) {
        throw new NotFoundException(
          `Producto componente ${comp.componentProductId} no encontrado en el tenant.`,
        );
      }
    }

    return this.prisma.billOfMaterials.create({
      data: {
        tenantId,
        parentProductId: dto.parentProductId,
        parentVariantId: dto.parentVariantId || null,
        code: dto.code,
        name: dto.name,
        type: dto.type || BomType.KIT,
        notes: dto.notes || null,
        components: {
          create: dto.components.map((c) => ({
            componentProductId: c.componentProductId,
            componentVariantId: c.componentVariantId || null,
            quantity: c.quantity,
          })),
        },
      },
      include: {
        parentProduct: { select: { id: true, sku: true, name: true } },
        components: {
          include: {
            componentProduct: { select: { id: true, sku: true, name: true } },
          },
        },
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.billOfMaterials.findMany({
      where: { tenantId, isActive: true },
      include: {
        parentProduct: { select: { id: true, sku: true, name: true } },
        parentVariant: { select: { id: true, sku: true, name: true } },
        _count: { select: { components: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const bom = await this.prisma.billOfMaterials.findFirst({
      where: { id, tenantId },
      include: {
        parentProduct: true,
        parentVariant: true,
        components: {
          include: {
            componentProduct: true,
            componentVariant: true,
          },
        },
      },
    });

    if (!bom) {
      throw new NotFoundException(`Lista de materiales ${id} no encontrada.`);
    }

    return bom;
  }

  /**
   * Calcula cuántos kits completos pueden ensamblarse según las existencias
   * físicas actuales de todos sus componentes en la bodega indicada.
   */
  async checkKitAvailability(
    bomId: string,
    tenantId: string,
    warehouseLocation: string = 'BODEGA_CENTRAL',
  ) {
    const bom = await this.findOne(bomId, tenantId);

    const componentAvailability = [];
    let maxAssembleable = Number.MAX_SAFE_INTEGER;

    for (const comp of bom.components) {
      const stock = await this.prisma.inventoryStock.findFirst({
        where: {
          tenantId,
          productId: comp.componentProductId,
          variantId: comp.componentVariantId || null,
          warehouseLocation,
        },
      });

      const currentStock = stock?.currentStock ?? 0;
      const canMakeWithThisComponent = Math.floor(currentStock / comp.quantity);

      if (canMakeWithThisComponent < maxAssembleable) {
        maxAssembleable = canMakeWithThisComponent;
      }

      componentAvailability.push({
        componentProductId: comp.componentProductId,
        componentName: comp.componentProduct.name,
        componentSku: comp.componentProduct.sku,
        requiredPerKit: comp.quantity,
        currentStock,
        maxKitsPossible: canMakeWithThisComponent,
      });
    }

    return {
      bomId: bom.id,
      bomCode: bom.code,
      bomName: bom.name,
      warehouseLocation,
      maxAssembleableKits: maxAssembleable === Number.MAX_SAFE_INTEGER ? 0 : maxAssembleable,
      components: componentAvailability,
    };
  }

  /**
   * Ensambla formalmente un Kit o Producto Fabricado:
   * - Descuenta atómicamente los componentes del stock (Kardex: SALIDA)
   * - Incrementa el stock del producto terminado (Kardex: ENTRADA)
   */
  async assembleKit(
    bomId: string,
    dto: AssembleKitDto,
    tenantId: string,
    userId: string,
  ) {
    const warehouseLocation = dto.warehouseLocation || 'BODEGA_CENTRAL';
    const bom = await this.findOne(bomId, tenantId);

    return this.prisma.$transaction(async (tx) => {
      // 1. Validar y descontar componentes
      for (const comp of bom.components) {
        const totalNeeded = comp.quantity * dto.quantity;
        const resolvedVariantId = comp.componentVariantId || null;

        const stock = await tx.inventoryStock.findFirst({
          where: {
            tenantId,
            productId: comp.componentProductId,
            variantId: resolvedVariantId,
            warehouseLocation,
          },
        });

        if (!stock || stock.currentStock < totalNeeded) {
          throw new BadRequestException(
            `Stock insuficiente del componente '${comp.componentProduct.name}' en ${warehouseLocation}. ` +
              `Disponible: ${stock?.currentStock ?? 0}, requerido para ensamble: ${totalNeeded}.`,
          );
        }

        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { currentStock: { decrement: totalNeeded } },
        });

        // Kardex SALIDA del componente
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: comp.componentProductId,
            variantId: resolvedVariantId,
            warehouseLocation,
            type: StockMovementType.SALIDA,
            quantity: totalNeeded,
            reference: `Ensamble de Kit: ${bom.code} (${dto.quantity} kits)`,
            createdById: userId,
          },
        });
      }

      // 2. Incrementar stock del producto terminado / kit
      const parentVariantId = bom.parentVariantId || null;
      let parentStock = await tx.inventoryStock.findFirst({
        where: {
          tenantId,
          productId: bom.parentProductId,
          variantId: parentVariantId,
          warehouseLocation,
        },
      });

      if (!parentStock) {
        parentStock = await tx.inventoryStock.create({
          data: {
            tenantId,
            productId: bom.parentProductId,
            variantId: parentVariantId,
            warehouseLocation,
            currentStock: dto.quantity,
          },
        });
      } else {
        parentStock = await tx.inventoryStock.update({
          where: { id: parentStock.id },
          data: { currentStock: { increment: dto.quantity } },
        });
      }

      // Kardex ENTRADA del producto kit terminado
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: bom.parentProductId,
          variantId: parentVariantId,
          warehouseLocation,
          type: StockMovementType.ENTRADA,
          quantity: dto.quantity,
          reference: `Producción / Ensamble de Kit: ${bom.code}`,
          createdById: userId,
        },
      });

      return {
        message: `Se ensamblaron exitosamente ${dto.quantity} unidades del kit '${bom.name}'.`,
        bomId: bom.id,
        bomCode: bom.code,
        assembledQuantity: dto.quantity,
        warehouseLocation,
        parentProductNewStock: parentStock.currentStock,
      };
    });
  }
}
