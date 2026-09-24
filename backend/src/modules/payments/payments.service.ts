import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WebpayPlus,
  Options,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
  Environment,
} from 'transbank-sdk';
import { PrismaService } from '../../database/prisma.service';
import {
  InitiateWebpayDto,
  ConfirmWebpayDto,
  InitiateFlowDto,
} from './dto/payment-dtos';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  PaymentStatus,
  OrderStatus,
  InvoiceStatus,
} from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger =
    new Logger(PaymentsService.name);

  private readonly webpayTransaction: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const isProduction =
      this.configService.get<string>(
        'NODE_ENV',
      ) === 'production';

    const commerceCode =
      isProduction
        ? this.configService.getOrThrow<string>(
            'WEBPAY_COMMERCE_CODE',
          )
        : this.configService.get<string>(
            'WEBPAY_COMMERCE_CODE',
          ) ||
          IntegrationCommerceCodes.WEBPAY_PLUS;

    const apiKey =
      isProduction
        ? this.configService.getOrThrow<string>(
            'WEBPAY_API_KEY',
          )
        : this.configService.get<string>(
            'WEBPAY_API_KEY',
          ) ||
          IntegrationApiKeys.WEBPAY;

    const environment =
      isProduction
        ? Environment.Production
        : Environment.Integration;

    this.webpayTransaction =
      new WebpayPlus.Transaction(
        new Options(
          commerceCode,
          apiKey,
          environment,
        ),
      );
  }

  async createWebpayTransaction(
    dto: InitiateWebpayDto,
    tenantId: string,
    userId?: string,
  ) {
    const order =
      await this.prisma.order.findFirst({
        where: {
          id: dto.orderId,
          tenantId,
        },
      });

    if (!order) {
      throw new NotFoundException(
        `Orden con ID '${dto.orderId}' no encontrada.`,
      );
    }

    if (
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'No se puede iniciar un pago para una orden cancelada.',
      );
    }

    if (
      order.status === OrderStatus.PAID
    ) {
      throw new ConflictException(
        'La orden ya figura como pagada.',
      );
    }

    const amount =
      Math.round(
        Number(order.totalAmount),
      );

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        'La orden tiene un monto inválido para Webpay.',
      );
    }

    /*
     * Usamos exactamente el número de orden registrado
     * en PostgreSQL. No usamos un valor enviado por el cliente.
     */
    const buyOrder =
      order.orderNumber;

    const sessionId =
      `SES-${Date.now()}`;

    const returnUrl =
      this.configService.getOrThrow<string>(
        'WEBPAY_RETURN_URL',
      );

    try {
      const response =
        await this.webpayTransaction.create(
          buyOrder,
          sessionId,
          amount,
          returnUrl,
        );

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action:
            'INITIATE_WEBPAY_TRANSACTION',
          entityName: 'Order',
          entityId: order.id,
          newValues: {
            buyOrder,
            sessionId,
            amount,
            tokenGenerated: true,
          },
        },
      });

      return {
        token:
          response.token,
        url:
          response.url,
        buyOrder,
        amount,
        orderId:
          order.id,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido';

      const stack =
        error instanceof Error
          ? error.stack
          : undefined;

      this.logger.error(
        `Error iniciando Webpay Plus: ${message}`,
        stack,
      );

      throw new BadRequestException(
        'No se pudo iniciar Webpay Plus.',
      );
    }
  }

  async confirmWebpayTransaction(
    dto: ConfirmWebpayDto,
    tenantId: string,
    userId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException(
        'El tenant es obligatorio para confirmar el pago.',
      );
    }

    try {
      const commitResponse =
        await this.webpayTransaction.commit(
          dto.token,
        );

      const isApproved =
        commitResponse.response_code === 0 &&
        commitResponse.status === 'AUTHORIZED';

      if (!isApproved) {
        return {
          success: false,
          status: 'REJECTED',
          message:
            'Transacción rechazada por el banco emisor o cancelada.',
        };
      }

      return this.prisma.$transaction(
        async (tx) => {
          const buyOrder =
            String(
              commitResponse.buy_order || '',
            ).trim();

          if (!buyOrder) {
            throw new BadRequestException(
              'Transbank no devolvió un número de orden válido.',
            );
          }

          const order =
            await tx.order.findFirst({
              where: {
                tenantId,
                orderNumber: buyOrder,
              },
            });

          if (!order) {
            throw new NotFoundException(
              'La orden asociada al pago no existe dentro del tenant actual.',
            );
          }

          if (
            order.status ===
            OrderStatus.CANCELLED
          ) {
            throw new BadRequestException(
              'La orden está cancelada y no puede recibir pagos.',
            );
          }

          const gatewayAmount =
            Math.round(
              Number(
                commitResponse.amount,
              ),
            );

          const orderAmount =
            Math.round(
              Number(
                order.totalAmount,
              ),
            );

          if (
            gatewayAmount !==
            orderAmount
          ) {
            throw new BadRequestException(
              'El monto confirmado por Webpay no coincide con el total de la orden.',
            );
          }

          const existingInvoice =
            await tx.invoice.findFirst({
              where: {
                tenantId,
                orderId: order.id,
                status: {
                  not: InvoiceStatus.VOID,
                },
              },
              include: {
                payments: true,
              },
            });

          const invoice =
            existingInvoice ||
            (await tx.invoice.create({
              data: {
                tenantId,
                orderId: order.id,
                customerId:
                  order.customerId,
                invoiceNumber:
                  `FAC-${Date.now()
                    .toString()
                    .slice(-6)}`,
                status:
                  InvoiceStatus.DRAFT,
                paymentStatus:
                  PaymentStatus.PENDING,
                paymentMethod:
                  'WEBPAY_PLUS',
                subtotalAmount:
                  Math.round(
                    Number(
                      order.subtotalAmount,
                    ),
                  ),
                taxAmount:
                  Math.round(
                    Number(
                      order.taxAmount,
                    ),
                  ),
                totalAmount:
                  orderAmount,
              },
              include: {
                payments: true,
              },
            }));

          const authorizationCode =
            commitResponse.authorization_code
              ? String(
                  commitResponse.authorization_code,
                )
              : null;

          if (authorizationCode) {
            const duplicatePayment =
              await tx.payment.findFirst({
                where: {
                  tenantId,
                  invoiceId:
                    invoice.id,
                  transactionRef:
                    authorizationCode,
                },
              });

            if (duplicatePayment) {
              return {
                success: true,
                status: 'COMPLETED',
                message:
                  'El pago Webpay ya había sido procesado.',
                authorizationCode,
                amount:
                  orderAmount,
                payment:
                  duplicatePayment,
                invoice,
              };
            }
          }

          if (
            order.status ===
            OrderStatus.PAID
          ) {
            throw new ConflictException(
              'La orden ya figura como pagada.',
            );
          }

          await tx.order.update({
            where: {
              id: order.id,
            },
            data: {
              status:
                OrderStatus.PAID,
            },
          });

          const paymentRecord =
            await tx.payment.create({
              data: {
                tenantId,
                invoiceId:
                  invoice.id,
                amount:
                  orderAmount,
                paymentMethod:
                  'WEBPAY_PLUS',
                transactionRef:
                  authorizationCode,
                status:
                  PaymentStatus.COMPLETED,
              },
              include: {
                invoice: true,
              },
            });

          await tx.invoice.update({
            where: {
              id: invoice.id,
            },
            data: {
              paymentStatus:
                PaymentStatus.COMPLETED,
              paymentMethod:
                'WEBPAY_PLUS',
            },
          });

          await tx.auditLog.create({
            data: {
              tenantId,
              userId,
              action:
                'CONFIRM_WEBPAY_PAYMENT',
              entityName: 'Payment',
              entityId:
                paymentRecord.id,
              newValues: {
                authorizationCode,
                amount:
                  orderAmount,
                paymentTypeCode:
                  commitResponse.payment_type_code,
              },
            },
          });

          return {
            success: true,
            status: 'COMPLETED',
            message:
              'Pago autorizado y confirmado exitosamente.',
            authorizationCode,
            amount:
              orderAmount,
            paymentDate:
              commitResponse.transaction_date,
            payment:
              paymentRecord,
            invoice:
              await tx.invoice.findUnique({
                where: {
                  id: invoice.id,
                },
              }),
          };
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido';

      const stack =
        error instanceof Error
          ? error.stack
          : undefined;

      this.logger.error(
        `Error confirmando Webpay: ${message}`,
        stack,
      );

      if (
        error instanceof
          BadRequestException ||
        error instanceof
          NotFoundException ||
        error instanceof
          ConflictException
      ) {
        throw error;
      }

      throw new BadRequestException(
        'Fallo en la confirmación de Webpay.',
      );
    }
  }

  async createFlowTransaction(
    dto: InitiateFlowDto,
    tenantId: string,
  ) {
    const order =
      await this.prisma.order.findFirst({
        where: {
          id: dto.orderId,
          tenantId,
        },
      });

    if (!order) {
      throw new NotFoundException(
        `Orden '${dto.orderId}' no encontrada.`,
      );
    }

    const amount =
      Math.round(
        Number(order.totalAmount),
      );

    return {
      gateway: 'FLOW',
      orderId:
        order.id,
      amount,
      flowOrderNumber:
        `FLOW-${Date.now()}`,
      redirectUrl:
        `https://www.flow.cl/pago/mock/${Date.now()}`,
      message:
        'Sesión Flow iniciada en entorno sandbox.',
    };
  }

  async createMercadoPagoPreference(
    orderId: string,
    tenantId: string,
  ) {
    const order =
      await this.prisma.order.findFirst({
        where: {
          id: orderId,
          tenantId,
        },
      });

    if (!order) {
      throw new NotFoundException(
        `Orden '${orderId}' no encontrada.`,
      );
    }

    const amount =
      Math.round(
        Number(order.totalAmount),
      );

    const preferenceId =
      `MP-CL-${Date.now()}`;

    return {
      gateway:
        'MERCADOPAGO_CHILE',
      orderId:
        order.id,
      amount,
      preferenceId,
      initPoint:
        `https://www.mercadopago.cl/checkout/v1/redirect?pref_id=${preferenceId}`,
    };
  }

  async handleWebhook(
    gateway: string,
    payload: Record<string, unknown>,
    tenantId: string,
  ) {
    const normalizedGateway =
      gateway.trim().toLowerCase();

    const allowedGateways = [
      'webpay',
      'flow',
      'mercadopago',
    ];

    if (
      !allowedGateways.includes(
        normalizedGateway,
      )
    ) {
      throw new BadRequestException(
        'Pasarela de pago no soportada.',
      );
    }

    if (!tenantId) {
      throw new BadRequestException(
        'El tenant es obligatorio para procesar el webhook.',
      );
    }

    const eventId =
      typeof payload.id === 'string'
        ? payload.id
        : typeof payload.orderId === 'string'
          ? payload.orderId
          : 'UNKNOWN';

    /*
     * Este endpoint no autoriza ni contabiliza pagos.
     * La integración real debe agregar la firma
     * específica de cada proveedor antes de aplicar cambios financieros.
     */
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action:
          `WEBHOOK_RECEIVED_${normalizedGateway.toUpperCase()}`,
        entityName:
          'PaymentWebhook',
        entityId:
          eventId,
        newValues: {
          gateway:
            normalizedGateway,
          eventId,
          received: true,
        },
      },
    });

    return {
      received: true,
      gateway:
        normalizedGateway,
      timestamp:
        new Date().toISOString(),
    };
  }

  async findAll(
    tenantId: string,
  ) {
    return this.prisma.payment.findMany({
      where: {
        tenantId,
      },
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(
    createPaymentDto: CreatePaymentDto,
    tenantId: string,
  ) {
    const invoice =
      await this.prisma.invoice.findFirst({
        where: {
          id:
            createPaymentDto.invoiceId,
          tenantId,
        },
        include: {
          payments: true,
        },
      });

    if (!invoice) {
      throw new NotFoundException(
        'Factura no encontrada para esta empresa.',
      );
    }

    if (
      createPaymentDto.amount <= 0
    ) {
      throw new BadRequestException(
        'El monto del pago debe ser mayor a cero.',
      );
    }

    const amount =
      Math.round(
        createPaymentDto.amount,
      );

    const previousPaymentsTotal =
      invoice.payments.reduce(
        (acc, curr) =>
          acc + Math.round(
            Number(curr.amount),
          ),
        0,
      );

    const invoiceTotal =
      Math.round(
        Number(
          invoice.totalAmount,
        ),
      );

    const remaining =
      invoiceTotal -
      previousPaymentsTotal;

    if (remaining <= 0) {
      throw new ConflictException(
        'La factura ya está completamente pagada.',
      );
    }

    if (amount > remaining) {
      throw new BadRequestException(
        `El pago excede el saldo pendiente de la factura. Saldo restante: $${remaining.toLocaleString('es-CL')}.`,
      );
    }

    const transactionRef =
      createPaymentDto.transactionRef
        ?.trim() || null;

    if (transactionRef) {
      const existingPayment =
        await this.prisma.payment.findFirst({
          where: {
            tenantId,
            transactionRef,
          },
        });

      if (existingPayment) {
        throw new ConflictException(
          'El comprobante de pago ya fue registrado.',
        );
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        const payment =
          await tx.payment.create({
            data: {
              tenantId,
              invoiceId:
                invoice.id,
              amount,
              paymentMethod:
                createPaymentDto.paymentMethod ||
                'TRANSFERENCIA',
              transactionRef,
              status:
                PaymentStatus.COMPLETED,
            },
          });

        const totalPaid =
          previousPaymentsTotal +
          amount;

        if (
          totalPaid >=
          invoiceTotal
        ) {
          await tx.invoice.update({
            where: {
              id: invoice.id,
            },
            data: {
              paymentStatus:
                PaymentStatus.COMPLETED,
            },
          });
        }

        return payment;
      },
    );
  }
}