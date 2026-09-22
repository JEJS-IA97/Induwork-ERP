import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebpayPlus, Options, IntegrationApiKeys, IntegrationCommerceCodes, Environment } from 'transbank-sdk';
import { PrismaService } from '../../database/prisma.service';
import { InitiateWebpayDto, ConfirmWebpayDto, InitiateFlowDto } from './dto/payment-dtos';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus, OrderStatus, InvoiceStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private webpayTransaction: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const commerceCode = this.configService.get<string>('WEBPAY_COMMERCE_CODE') || IntegrationCommerceCodes.WEBPAY_PLUS;
    const apiKey = this.configService.get<string>('WEBPAY_API_KEY') || IntegrationApiKeys.WEBPAY;

    const environment = isProduction ? Environment.Production : Environment.Integration;

    this.webpayTransaction = new WebpayPlus.Transaction(
      new Options(commerceCode, apiKey, environment),
    );
  }

  /**
   * 1. Iniciar Transacción en Transbank Webpay Plus
   */
  async createWebpayTransaction(
    dto: InitiateWebpayDto,
    tenantId: string,
    userId?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, tenantId },
      include: { customer: true },
    });

    if (!order) {
      throw new NotFoundException(`Orden con ID '${dto.orderId}' no encontrada.`);
    }

    const buyOrder = `ORD-${order.orderNumber.replace(/[^0-9]/g, '') || Date.now().toString().slice(-6)}`;
    const sessionId = `SES-${Date.now()}`;
    const amount = Math.round(dto.amount);

    try {
      const response = await this.webpayTransaction.create(
        buyOrder,
        sessionId,
        amount,
        dto.returnUrl,
      );

      // Registrar Auditoría
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'INITIATE_WEBPAY_TRANSACTION',
          entityName: 'Order',
          entityId: order.id,
          newValues: {
            buyOrder,
            sessionId,
            amount,
            token: response.token,
          },
        },
      });

      return {
        token: response.token,
        url: response.url,
        buyOrder,
        amount,
        orderId: order.id,
      };
    } catch (error) {
      this.logger.error('Error iniciando Webpay Plus:', error);
      throw new BadRequestException(`No se pudo iniciar Webpay Plus: ${error.message}`);
    }
  }

  /**
   * 2. Confirmar Transacción de Transbank Webpay Plus
   */
  async confirmWebpayTransaction(
    dto: ConfirmWebpayDto,
    tenantId: string,
    userId?: string,
  ) {
    try {
      const commitResponse = await this.webpayTransaction.commit(dto.token);

      const isApproved = commitResponse.response_code === 0 || commitResponse.status === 'AUTHORIZED';

      if (!isApproved) {
        return {
          success: false,
          status: 'REJECTED',
          message: 'Transacción rechazada por el banco emisor o cancelada.',
          details: commitResponse,
        };
      }

      // Procesar transacción atómica en PostgreSQL
      return this.prisma.$transaction(async (tx) => {
        const buyOrderStr = commitResponse.buy_order;
        const order = await tx.order.findFirst({
          where: {
            tenantId,
            OR: [
              { orderNumber: buyOrderStr },
              { orderNumber: { contains: buyOrderStr.replace('ORD-', '') } },
            ],
          },
        });

        const updatedOrderId = order?.id;

        if (order) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.PAID },
          });
        }

        // Crear Factura asociada
        const invoice = await tx.invoice.create({
          data: {
            tenantId,
            orderId: updatedOrderId,
            invoiceNumber: `FAC-${Date.now().toString().slice(-6)}`,
            status: InvoiceStatus.ISSUED,
            paymentStatus: PaymentStatus.COMPLETED,
            paymentMethod: 'WEBPAY_PLUS',
            subtotalAmount: commitResponse.amount / 1.19,
            taxAmount: commitResponse.amount - commitResponse.amount / 1.19,
            totalAmount: commitResponse.amount,
            issuedAt: new Date(),
          },
        });

        // Registrar pago
        const paymentRecord = await tx.payment.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            amount: commitResponse.amount,
            paymentMethod: 'WEBPAY_PLUS',
            transactionRef: `${commitResponse.authorization_code || ''} (Token: ${dto.token.slice(0, 10)}...)`,
            status: PaymentStatus.COMPLETED,
          },
          include: { invoice: true },
        });

        // Auditoría
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: 'CONFIRM_WEBPAY_PAYMENT',
            entityName: 'Payment',
            entityId: paymentRecord.id,
            newValues: {
              authorizationCode: commitResponse.authorization_code,
              amount: commitResponse.amount,
              cardDetail: commitResponse.card_detail,
              paymentTypeCode: commitResponse.payment_type_code,
            },
          },
        });

        return {
          success: true,
          status: 'COMPLETED',
          message: 'Pago autorizado y confirmado exitosamente.',
          authorizationCode: commitResponse.authorization_code,
          amount: commitResponse.amount,
          paymentDate: commitResponse.transaction_date,
          payment: paymentRecord,
          invoice,
        };
      });
    } catch (error) {
      this.logger.error('Error confirmando transacción Webpay:', error);
      throw new BadRequestException(`Fallo en confirmación de Webpay: ${error.message}`);
    }
  }

  /**
   * 3. Pasarela Flow Chile
   */
  async createFlowTransaction(dto: InitiateFlowDto, tenantId: string) {
    const flowOrderNumber = `FLOW-${Date.now()}`;
    return {
      gateway: 'FLOW',
      orderId: dto.orderId,
      amount: dto.amount,
      flowOrderNumber,
      redirectUrl: `https://www.flow.cl/pago/mock/${flowOrderNumber}`,
      message: 'Sesión Flow iniciada en entorno sandbox.',
    };
  }

  /**
   * 4. Pasarela Mercado Pago Chile
   */
  async createMercadoPagoPreference(orderId: string, amount: number, tenantId: string) {
    const preferenceId = `MP-CL-${Date.now()}`;
    return {
      gateway: 'MERCADOPAGO_CHILE',
      orderId,
      amount,
      preferenceId,
      initPoint: `https://www.mercadopago.cl/checkout/v1/redirect?pref_id=${preferenceId}`,
    };
  }

  /**
   * 5. Webhook Receptor y Procesador Multipasarela
   */
  async handleWebhook(
    gateway: string,
    payload: any,
    headers: any,
    tenantId: string,
  ) {
    this.logger.log(`📥 Webhook recibido de pasarela: ${gateway} (Tenant: ${tenantId})`);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: `WEBHOOK_RECEIVED_${gateway.toUpperCase()}`,
        entityName: 'PaymentWebhook',
        entityId: payload.id || payload.orderId || 'UNKNOWN',
        newValues: { gateway, payload, headers },
      },
    });

    return { received: true, gateway, timestamp: new Date().toISOString() };
  }

  /**
   * Listar pagos del tenant
   */
  async findAll(tenantId: string) {
    return this.prisma.payment.findMany({
      where: { tenantId },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            status: true,
            paymentStatus: true,
            pdfUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Registrar pago manual (Transferencia, Cheque, Efectivo)
   */
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
          paymentMethod: paymentMethod || 'TRANSFERENCIA',
          transactionRef,
          status: PaymentStatus.COMPLETED,
        },
      });

      const totalPaid = previousPaymentsTotal + amount;
      if (totalPaid >= Number(invoice.totalAmount)) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paymentStatus: PaymentStatus.COMPLETED,
            status: InvoiceStatus.ISSUED,
          },
        });
      }

      return payment;
    });
  }
}
