import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CustomerType } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async findAll(tenantId: string) {
    return this.prisma.order.findMany({
      where: { tenantId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            rutOrTaxId: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                sku: true,
                name: true,
                orderName: true,
              },
            },
          },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            paymentStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
        invoices: true,
      },
    });

    if (!order) {
      throw new NotFoundException(
        `Orden con ID '${id}' no encontrada.`,
      );
    }

    return order;
  }

  async create(
    createOrderDto: CreateOrderDto,
    tenantId: string,
  ) {
    const {
      customerId,
      customerName,
      customerEmail,
      items,
    } = createOrderDto;

    if (!items || items.length === 0) {
      throw new BadRequestException(
        'La orden debe contener al menos un producto.',
      );
    }

    let resolvedCustomerId = customerId;

    if (resolvedCustomerId) {
      const customer =
        await this.prisma.customer.findFirst({
          where: {
            id: resolvedCustomerId,
            tenantId,
            isActive: true,
            type: {
              in: [
                CustomerType.CLIENTE,
                CustomerType.AMBOS,
              ],
            },
          },
        });

      if (!customer) {
        throw new NotFoundException(
          'El cliente indicado no existe dentro del tenant actual.',
        );
      }
    } else {
      const customerNameToUse =
        customerName || 'Cliente Mostrador';

      const existingCustomer =
        await this.prisma.customer.findFirst({
          where: {
            tenantId,
            isActive: true,
            type: {
              in: [
                CustomerType.CLIENTE,
                CustomerType.AMBOS,
              ],
            },
            OR: [
              { name: customerNameToUse },
              ...(customerEmail
                ? [{ email: customerEmail }]
                : []),
            ],
          },
        });

      if (existingCustomer) {
        resolvedCustomerId =
          existingCustomer.id;
      } else {
        const newCustomer =
          await this.prisma.customer.create({
            data: {
              tenantId,
              type: CustomerType.CLIENTE,
              name: customerNameToUse,
              email: customerEmail,
            },
          });

        resolvedCustomerId = newCustomer.id;
      }
    }

    const orderNumber =
      `ORD-${Date.now().toString().slice(-6)}`;

    let subtotalAmount = 0;
    let taxAmount = 0;

    const orderItemsData: Array<{
      productId: string;
      variantId: string | null;
      productName: string;
      productDescription: string | null;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      taxRate: number;
      subtotal: number;
      total: number;
    }> = [];

    for (const item of items) {
      const product =
        await this.prisma.product.findFirst({
          where: {
            id: item.productId,
            tenantId,
            isActive: true,
            isArchived: false,
          },
        });

      if (!product) {
        throw new NotFoundException(
          `Producto '${item.productId}' no encontrado dentro del tenant actual.`,
        );
      }

      let resolvedVariant = null;

      if (item.variantId) {
        resolvedVariant =
          await this.prisma.productVariant.findFirst({
            where: {
              id: item.variantId,
              tenantId,
              productId: product.id,
              isActive: true,
            },
          });

        if (!resolvedVariant) {
          throw new NotFoundException(
            `La variante '${item.variantId}' no pertenece al producto solicitado.`,
          );
        }
      }

      const basePrice =
        resolvedVariant?.price ??
        product.price;

      const baseCost =
        resolvedVariant?.cost ??
        product.cost;

      const unitPrice =
        Number(basePrice);

      const unitCost =
        Number(baseCost);

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(
          `El producto '${product.name}' tiene un precio inválido configurado.`,
        );
      }

      const itemSubtotal =
        this.roundCurrency(
          item.quantity * unitPrice,
        );

      const taxRate =
        Number(product.taxRate);

      if (
        !Number.isFinite(taxRate) ||
        taxRate < 0 ||
        taxRate > 100
      ) {
        throw new BadRequestException(
          `El producto '${product.name}' tiene una tasa de IVA inválida.`,
        );
      }

      const itemTax =
        this.roundCurrency(
          itemSubtotal * (taxRate / 100),
        );

      const itemTotal =
        this.roundCurrency(
          itemSubtotal + itemTax,
        );

      subtotalAmount =
        this.roundCurrency(
          subtotalAmount + itemSubtotal,
        );

      taxAmount =
        this.roundCurrency(
          taxAmount + itemTax,
        );

      orderItemsData.push({
        productId: product.id,
        variantId:
          resolvedVariant?.id || null,
        productName:
          product.orderName ||
          product.name,
        productDescription:
          product.orderDescription ||
          product.description,
        quantity: item.quantity,
        unitPrice,
        unitCost,
        taxRate,
        subtotal: itemSubtotal,
        total: itemTotal,
      });
    }

    const totalAmount =
      this.roundCurrency(
        subtotalAmount + taxAmount,
      );

    return this.prisma.order.create({
      data: {
        tenantId,
        orderNumber,
        customerId: resolvedCustomerId!,
        subtotalAmount,
        taxAmount,
        totalAmount,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        customer: true,
        items: true,
      },
    });
  }
}