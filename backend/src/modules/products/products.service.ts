import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId, isActive: true, isArchived: false },
      include: {
        category: true,
        variants: true,
        documents: true,
        galleryImages: true,
        inventoryStocks: {
          select: {
            warehouseLocation: true,
            currentStock: true,
            reservedStock: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        variants: true,
        documents: true,
        galleryImages: true,
        inventoryStocks: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID '${id}' no encontrado.`);
    }

    return product;
  }

  async create(createProductDto: CreateProductDto, tenantId: string) {
    const existing = await this.prisma.product.findFirst({
      where: {
        tenantId,
        sku: createProductDto.sku,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un producto con el SKU '${createProductDto.sku}' en esta empresa.`,
      );
    }

    return this.prisma.product.create({
      data: {
        tenantId,
        sku: createProductDto.sku,
        name: createProductDto.name,
        description: createProductDto.description,
        price: createProductDto.price,
        cost: createProductDto.cost || 0,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);

    return this.prisma.product.update({
      where: { id },
      data: { isArchived: true },
    });
  }
}
