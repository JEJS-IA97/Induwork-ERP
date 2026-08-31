import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class InvoicingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { tenantId },
      include: {
        order: {
          select: {
            orderNumber: true,
            customer: {
              select: {
                name: true,
                rutOrTaxId: true,
              },
            },
          },
        },
        customer: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        order: {
          include: {
            items: true,
          },
        },
        customer: true,
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Factura con ID '${id}' no encontrada.`);
    }

    return invoice;
  }

  async create(createInvoiceDto: CreateInvoiceDto, tenantId: string) {
    const invoiceNumber = `FAC-${Date.now().toString().slice(-6)}`;
    const taxAmount = createInvoiceDto.taxAmount || createInvoiceDto.totalAmount * 0.19;
    const subtotalAmount = createInvoiceDto.totalAmount - taxAmount;

    let customerId: string | undefined;

    if (createInvoiceDto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: createInvoiceDto.orderId, tenantId },
      });
      if (order) {
        customerId = order.customerId;
      }
    }

    return this.prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        orderId: createInvoiceDto.orderId,
        customerId,
        status: InvoiceStatus.DRAFT,
        paymentStatus: PaymentStatus.PENDING,
        subtotalAmount,
        taxAmount,
        totalAmount: createInvoiceDto.totalAmount,
        dueDate: createInvoiceDto.dueDate ? new Date(createInvoiceDto.dueDate) : null,
      },
    });
  }
}
