import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WebpayPlus,
  Options,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
  Environment,
} from 'transbank-sdk';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  InitiateWebpayDto,
  ConfirmWebpayDto,
  InitiateFlowDto,
} from './dto/payment-dtos';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  Prisma,
  PaymentStatus,
  OrderStatus,
  InvoiceStatus,
} from '@prisma/client';

type FlowPaymentStatusResponse = {
  flowOrder?: number | string;
  commerceOrder?: string;
  status?: number | string;
  amount?: number | string;
  currency?: string;
  paymentData?: Record<string, unknown>;
};

@Injectable()
export class PaymentsService {
  private readonly logger =
    new Logger(PaymentsService.name);

  private readonly webpayTransaction: any;
  private readonly isProduction: boolean;
  private readonly paymentWebhooksEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.isProduction =
      this.configService.get<string>(
        'NODE_ENV',
      ) === 'production';

    this.paymentWebhooksEnabled =
      this.configService
        .get<string>(
          'PAYMENT_WEBHOOKS_ENABLED',
        )
        ?.trim()
        .toLowerCase() === 'true';

    const commerceCode =
      this.isProduction
        ? this.configService.getOrThrow<string>(
            'WEBPAY_COMMERCE_CODE',
          )
        : this.configService.get<string>(
            'WEBPAY_COMMERCE_CODE',
          ) ||
          IntegrationCommerceCodes.WEBPAY_PLUS;

    const apiKey =
      this.isProduction
        ? this.configService.getOrThrow<string>(
            'WEBPAY_API_KEY',
          )
        : this.configService.get<string>(
            'WEBPAY_API_KEY',
          ) ||
          IntegrationApiKeys.WEBPAY;

    const environment =
      this.isProduction
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

  private requireWebhookConfiguration() {
    if (!this.paymentWebhooksEnabled) {
      throw new ServiceUnavailableException(
        'Los webhooks de pago están deshabilitados. Configure PAYMENT_WEBHOOKS_ENABLED=true cuando las integraciones estén preparadas.',
      );
    }
  }

  private getFlowCredentials() {
    const apiKey =
      this.configService
        .get<string>('FLOW_API_KEY')
        ?.trim() || '';

    const secretKey =
      this.configService
        .get<string>('FLOW_SECRET_KEY')
        ?.trim() || '';

    if (!apiKey || !secretKey) {
      throw new ServiceUnavailableException(
        'La configuración de Flow no está disponible.',
      );
    }

    return {
      apiKey,
      secretKey,
    };
  }

  private getMercadoPagoWebhookSecret(): string {
    const secret =
      this.configService
        .get<string>(
          'MERCADOPAGO_WEBHOOK_SECRET',
        )
        ?.trim() || '';

    if (!secret) {
      throw new ServiceUnavailableException(
        'La clave de webhook de Mercado Pago no está configurada.',
      );
    }

    return secret;
  }

  private signFlowParams(
    params: Record<string, string>,
    secretKey: string,
  ): string {
    const keys = Object.keys(params).sort();

    const payload = keys
      .map(
        (key) =>
          `${key}${params[key]}`,
      )
      .join('');

    return createHmac(
      'sha256',
      secretKey,
    )
      .update(payload)
      .digest('hex');
  }

  private secureCompare(
    actual: string,
    expected: string,
  ): boolean {
    const actualBuffer =
      Buffer.from(actual);
    const expectedBuffer =
      Buffer.from(expected);

    if (
      actualBuffer.length !==
      expectedBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(
      actualBuffer,
      expectedBuffer,
    );
  }

  private verifyMercadoPagoSignature(
    xSignature: string,
    xRequestId: string,
    dataId: string,
    secret: string,
  ) {
    if (
      !xSignature ||
      !xRequestId ||
      !dataId
    ) {
      throw new UnauthorizedException(
        'La firma del webhook de Mercado Pago está incompleta.',
      );
    }

    const signatureParts =
      xSignature
        .split(',')
        .map((part) =>
          part.trim(),
        );

    let ts = '';
    let v1 = '';

    for (const part of signatureParts) {
      const separator =
        part.indexOf('=');

      if (separator <= 0) {
        continue;
      }

      const key =
        part
          .slice(0, separator)
          .trim();

      const value =
        part
          .slice(separator + 1)
          .trim();

      if (key === 'ts') {
        ts = value;
      }

      if (key === 'v1') {
        v1 = value;
      }
    }

    if (!ts || !v1) {
      throw new UnauthorizedException(
        'La firma del webhook de Mercado Pago no tiene los componentes requeridos.',
      );
    }

    const normalizedDataId =
      dataId.trim().toLowerCase();

    const manifest =
      `id:${normalizedDataId};request-id:${xRequestId};ts:${ts};`;

    const expected =
      createHmac(
        'sha256',
        secret,
      )
        .update(manifest)
        .digest('hex');

    if (
      !this.secureCompare(
        v1,
        expected,
      )
    ) {
      throw new UnauthorizedException(
        'Firma de webhook de Mercado Pago inválida.',
      );
    }
  }

  private async getFlowPaymentStatus(
    token: string,
  ): Promise<FlowPaymentStatusResponse> {
    const {
      apiKey,
      secretKey,
    } = this.getFlowCredentials();

    const baseUrl =
      this.isProduction
        ? 'https://www.flow.cl/api'
        : 'https://sandbox.flow.cl/api';

    const params = {
      apiKey,
      token,
    };

    const signature =
      this.signFlowParams(
        params,
        secretKey,
      );

    const query =
      new URLSearchParams({
        ...params,
        s: signature,
      });

    const url =
      `${baseUrl}/payment/getStatus?${query.toString()}`;

    let response: Response;

    try {
      response =
        await fetch(url, {
          method: 'GET',
          headers: {
            Accept:
              'application/json',
          },
        });
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
        `Error consultando estado de Flow: ${message}`,
        stack,
      );

      throw new ServiceUnavailableException(
        'No fue posible consultar el estado de la transacción en Flow.',
      );
    }

    let responseBody: unknown;

    try {
      responseBody =
        await response.json();
    } catch {
      throw new ServiceUnavailableException(
        'Flow devolvió una respuesta no válida.',
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `Flow rechazó la consulta de estado. HTTP ${response.status}.`,
      );

      throw new UnauthorizedException(
        'Flow no pudo validar el token de la transacción.',
      );
    }

    if (
      !responseBody ||
      typeof responseBody !== 'object'
    ) {
      throw new ServiceUnavailableException(
        'Flow devolvió una respuesta de estado inválida.',
      );
    }

    return responseBody as FlowPaymentStatusResponse;
  }

  private async resolveTenantByCode(
    tenantCode: string,
  ) {
    const normalizedCode =
      tenantCode.trim().toLowerCase();

    if (!normalizedCode) {
      throw new BadRequestException(
        'El código del tenant es obligatorio.',
      );
    }

    const tenant =
      await this.prisma.tenant.findFirst({
        where: {
          code: normalizedCode,
          isActive: true,
        },
      });

    if (!tenant) {
      throw new NotFoundException(
        'Tenant no encontrado o inactivo.',
      );
    }

    return tenant;
  }

  private async registerWebhookEvent(
    tenantId: string,
    gateway: string,
    eventId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    const lockKey = [
      'PAYMENT_WEBHOOK',
      tenantId,
      gateway,
      eventId,
    ].join(':');

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${lockKey}, 0)
          )
        `;

        const existing =
          await tx.auditLog.findFirst({
            where: {
              tenantId,
              action:
                `WEBHOOK_RECEIVED_${gateway.toUpperCase()}`,
              entityName:
                'PaymentWebhook',
              entityId:
                eventId,
            },
          });

        if (existing) {
          return {
            duplicate: true,
            eventId,
          };
        }

        await tx.auditLog.create({
          data: {
            tenantId,
            action:
              `WEBHOOK_RECEIVED_${gateway.toUpperCase()}`,
            entityName:
              'PaymentWebhook',
            entityId:
              eventId,
            newValues: metadata,
          },
        });

        return {
          duplicate: false,
          eventId,
        };
      },
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
      order.status ===
      OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'No se puede iniciar un pago para una orden cancelada.',
      );
    }

    if (
      order.status ===
      OrderStatus.PAID
    ) {
      throw new ConflictException(
        'La orden ya figura como pagada.',
      );
    }

    const amount =
      Math.round(
        Number(
          order.totalAmount,
        ),
      );

    if (
      !Number.isInteger(
        amount,
      ) ||
      amount <= 0
    ) {
      throw new BadRequestException(
        'La orden tiene un monto inválido para Webpay.',
      );
    }

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
          entityName:
            'Order',
          entityId:
            order.id,
          newValues: {
            buyOrder,
            sessionId,
            amount,
            tokenGenerated:
              true,
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
        commitResponse.response_code ===
          0 &&
        commitResponse.status ===
          'AUTHORIZED';

      if (!isApproved) {
        return {
          success: false,
          status:
            'REJECTED',
          message:
            'Transacción rechazada por el banco emisor o cancelada.',
        };
      }

      return this.prisma.$transaction(
        async (tx) => {
          const buyOrder =
            String(
              commitResponse.buy_order ||
                '',
            ).trim();

          if (!buyOrder) {
            throw new BadRequestException(
              'Transbank no devolvió un número de orden válido.',
            );
          }

          const orderLockKey = [
            'PAYMENT_ORDER',
            tenantId,
            buyOrder,
          ].join(':');

          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${orderLockKey}, 0)
            )
          `;

          const order =
            await tx.order.findFirst({
              where: {
                tenantId,
                orderNumber:
                  buyOrder,
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
                orderId:
                  order.id,
                status: {
                  not:
                    InvoiceStatus.VOID,
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
                orderId:
                  order.id,
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

          if (
            authorizationCode
          ) {
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

            if (
              duplicatePayment
            ) {
              return {
                success: true,
                status:
                  'COMPLETED',
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
              id:
                order.id,
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
              id:
                invoice.id,
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
              entityName:
                'Payment',
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
            status:
              'COMPLETED',
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
                  id:
                    invoice.id,
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
        Number(
          order.totalAmount,
        ),
      );

    return {
      gateway:
        'FLOW',
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
        Number(
          order.totalAmount,
        ),
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

  async handleFlowWebhook(
    tenantCode: string,
    token: string,
  ) {
    this.requireWebhookConfiguration();

    const tenant =
      await this.resolveTenantByCode(
        tenantCode,
      );

    const normalizedToken =
      token.trim();

    if (!normalizedToken) {
      throw new BadRequestException(
        'El token de Flow es obligatorio.',
      );
    }

    const flowStatus =
      await this.getFlowPaymentStatus(
        normalizedToken,
      );

    const commerceOrder =
      String(
        flowStatus.commerceOrder ||
          '',
      ).trim();

    if (!commerceOrder) {
      throw new BadRequestException(
        'Flow no devolvió un commerceOrder válido.',
      );
    }

    const order =
      await this.prisma.order.findFirst({
        where: {
          tenantId: tenant.id,
          orderNumber:
            commerceOrder,
        },
      });

    if (!order) {
      throw new NotFoundException(
        'La orden de Flow no existe dentro del tenant indicado.',
      );
    }

    const flowAmount =
      Math.round(
        Number(
          flowStatus.amount,
        ),
      );

    const orderAmount =
      Math.round(
        Number(
          order.totalAmount,
        ),
      );

    if (
      !Number.isInteger(
        flowAmount,
      ) ||
      flowAmount !==
        orderAmount
    ) {
      throw new BadRequestException(
        'El monto reportado por Flow no coincide con el total de la orden.',
      );
    }

    const eventId =
      `FLOW:${String(
        flowStatus.flowOrder ??
          normalizedToken,
      )}`;

    const event =
      await this.registerWebhookEvent(
        tenant.id,
        'flow',
        eventId,
        {
          gateway:
            'flow',
          flowOrder:
            flowStatus.flowOrder,
          commerceOrder,
          status:
            flowStatus.status,
          amount:
            flowAmount,
          orderId:
            order.id,
        },
      );

    if (
      event.duplicate
    ) {
      return {
        received: true,
        duplicate: true,
        gateway:
          'flow',
        eventId,
      };
    }

    return {
      received: true,
      duplicate: false,
      gateway:
        'flow',
      eventId,
      orderId:
        order.id,
      orderStatus:
        order.status,
      gatewayStatus:
        flowStatus.status,
      message:
        'Callback de Flow autenticado y registrado. El webhook no contabiliza pagos automáticamente.',
    };
  }

  async handleMercadoPagoWebhook(
    tenantCode: string,
    xSignature: string,
    xRequestId: string,
    dataId: string,
    payload: Record<string, unknown>,
  ) {
    this.requireWebhookConfiguration();

    const tenant =
      await this.resolveTenantByCode(
        tenantCode,
      );

    const secret =
      this.getMercadoPagoWebhookSecret();

    this.verifyMercadoPagoSignature(
      xSignature,
      xRequestId,
      dataId,
      secret,
    );

    const notificationId =
      typeof payload.id ===
        'string' ||
      typeof payload.id ===
        'number'
        ? String(
            payload.id,
          )
        : '';

    const action =
      typeof payload.action ===
      'string'
        ? payload.action
        : '';

    if (
      !notificationId
    ) {
      throw new BadRequestException(
        'Mercado Pago no envió un identificador de notificación válido.',
      );
    }

    const eventId =
      `MP:${notificationId}:${action || 'unknown'}`;

    const event =
      await this.registerWebhookEvent(
        tenant.id,
        'mercadopago',
        eventId,
        {
          gateway:
            'mercadopago',
          notificationId,
          action:
            action || null,
          dataId:
            dataId
              .trim()
              .toLowerCase(),
          type:
            typeof payload.type ===
            'string'
              ? payload.type
              : null,
          liveMode:
            typeof payload.live_mode ===
            'boolean'
              ? payload.live_mode
              : null,
        },
      );

    if (
      event.duplicate
    ) {
      return {
        received: true,
        duplicate: true,
        gateway:
          'mercadopago',
        eventId,
      };
    }

    return {
      received: true,
      duplicate: false,
      gateway:
        'mercadopago',
      eventId,
      message:
        'Webhook de Mercado Pago autenticado y registrado. La integración actual no contabiliza pagos automáticamente.',
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
            invoiceNumber:
              true,
            totalAmount:
              true,
            status: true,
            paymentStatus:
              true,
            pdfUrl: true,
          },
        },
      },
      orderBy: {
        createdAt:
          'desc',
      },
    });
  }

  async create(
    createPaymentDto: CreatePaymentDto,
    tenantId: string,
  ) {
    if (!Number.isInteger(createPaymentDto.amount) || createPaymentDto.amount <= 0) {
      throw new BadRequestException(
        'El monto del pago debe ser un número entero mayor a cero.',
      );
    }

    const transactionRef =
      createPaymentDto.transactionRef?.trim() ||
      null;

    const invoiceLockKey = [
      'PAYMENT_INVOICE',
      tenantId,
      createPaymentDto.invoiceId,
    ].join(':');

    const transactionRefLockKey = transactionRef
      ? [
          'PAYMENT_TRANSACTION_REF',
          tenantId,
          transactionRef,
        ].join(':')
      : null;

    return this.prisma.$transaction(
      async (tx) => {
        /*
         * Serializa los pagos sobre la misma factura. El saldo se vuelve a
         * consultar dentro de la misma transacción después del bloqueo, por lo
         * que dos solicitudes concurrentes no pueden aprobar el mismo saldo.
         */
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${invoiceLockKey}, 0)
          )
        `;

        /*
         * También serializa el mismo comprobante/transacción cuando se usa en
         * solicitudes concurrentes sobre facturas diferentes.
         */
        if (transactionRefLockKey) {
          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${transactionRefLockKey}, 0)
            )
          `;
        }

        const invoice =
          await tx.invoice.findFirst({
            where: {
              id: createPaymentDto.invoiceId,
              tenantId,
            },
          });

        if (!invoice) {
          throw new NotFoundException(
            'Factura no encontrada para esta empresa.',
          );
        }

        if (
          invoice.status ===
          InvoiceStatus.VOID
        ) {
          throw new BadRequestException(
            'No se puede registrar un pago sobre una factura anulada.',
          );
        }

        if (transactionRef) {
          const existingPayment =
            await tx.payment.findFirst({
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

        const paymentsAggregate =
          await tx.payment.aggregate({
            where: {
              tenantId,
              invoiceId: invoice.id,
              status: PaymentStatus.COMPLETED,
            },
            _sum: {
              amount: true,
            },
          });

        const previousPaymentsTotal = Math.round(
          Number(
            paymentsAggregate._sum.amount ||
              0,
          ),
        );

        const amount = Math.round(
          createPaymentDto.amount,
        );

        const invoiceTotal = Math.round(
          Number(invoice.totalAmount),
        );

        if (
          !Number.isInteger(invoiceTotal) ||
          invoiceTotal <= 0
        ) {
          throw new BadRequestException(
            'La factura tiene un total inválido.',
          );
        }

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

        const payment =
          await tx.payment.create({
            data: {
              tenantId,
              invoiceId: invoice.id,
              amount,
              paymentMethod:
                createPaymentDto.paymentMethod?.trim() ||
                'TRANSFERENCIA',
              transactionRef,
              status:
                PaymentStatus.COMPLETED,
            },
          });

        const totalPaid =
          previousPaymentsTotal +
          amount;

        await tx.invoice.update({
          where: {
            id: invoice.id,
          },
          data: {
            paymentStatus:
              totalPaid >= invoiceTotal
                ? PaymentStatus.COMPLETED
                : PaymentStatus.PENDING,
          },
        });

        return payment;
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
}
