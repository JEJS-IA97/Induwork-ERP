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
      where: { id, tenantId },
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
      throw new NotFoundException(`Orden con ID '${id}' no encontrada.`);
    }

    return order;
  }

  async create(createOrderDto: CreateOrderDto, tenantId: string) {
    const { customerId, customerName, customerEmail, items } = createOrderDto;

    if (!items || items.length === 0) {
      throw new BadRequestException('La orden debe contener al menos un producto.');
    }

    let resolvedCustomerId = customerId;

    if (!resolvedCustomerId) {
      // Find or create customer
      const existingCustomer = await this.prisma.customer.findFirst({
        where: {
          tenantId,
          OR: [
            { name: customerName || 'Cliente Mostrador' },
            ...(customerEmail ? [{ email: customerEmail }] : []),
          ],
        },
      });

      if (existingCustomer) {
        resolvedCustomerId = existingCustomer.id;
      } else {
        const newCustomer = await this.prisma.customer.create({
          data: {
            tenantId,
            type: CustomerType.CLIENTE,
            name: customerName || 'Cliente Mostrador',
            email: customerEmail,
          },
        });
        resolvedCustomerId = newCustomer.id;
      }
    }

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    let subtotalAmount = 0;

    const orderItemsData: any[] = [];

    for (const item of items) {
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, tenantId },
      });

      if (!product) {
        throw new NotFoundException(`Producto '${item.productId}' no encontrado.`);
      }

      const itemSubtotal = item.quantity * item.unitPrice;
      const itemTax = itemSubtotal * 0.19; // 19% IVA default
      const itemTotal = itemSubtotal + itemTax;

      subtotalAmount += itemSubtotal;

      orderItemsData.push({
        productId: item.productId,
        variantId: item.variantId || null,
        productName: product.orderName || product.name,
        productDescription: product.orderDescription || product.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: product.cost,
        taxRate: 19.0,
        subtotal: itemSubtotal,
        total: itemTotal,
      });
    }

    const taxAmount = subtotalAmount * 0.19;
    const totalAmount = subtotalAmount + taxAmount;

    return this.prisma.order.create({
      data: {
        tenantId,
        orderNumber,
        customerId: resolvedCustomerId,
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
