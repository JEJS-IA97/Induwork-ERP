import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.payment.findMany({
      where: { tenantId },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            totalAmount: true,
            status: true,
            paymentStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(createPaymentDto: CreatePaymentDto, tenantId: string) {
    const { invoiceId, amount, paymentMethod, transactionRef } = createPaymentDto;

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { payments: true },
    });

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada para esta empresa.');
    }

    const previousPaymentsTotal = invoice.payments.reduce(
      (acc, curr) => acc + Number(curr.amount),
      0,
    );

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          amount,
          paymentMethod: paymentMethod || 'TRANSFER',
          transactionRef,
          status: PaymentStatus.COMPLETED,
        },
      });

      const totalPaid = previousPaymentsTotal + amount;
      if (totalPaid >= Number(invoice.totalAmount)) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { paymentStatus: PaymentStatus.COMPLETED },
        });
      }

      return payment;
    });
  }
}
