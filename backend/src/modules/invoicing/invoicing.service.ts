import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  DteService,
  TipoDTE,
  DtePayload,
} from './services/dte.service';
import { PdfService } from './services/pdf.service';
import { GenerateDteDto } from './dto/generate-dte.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  InvoiceStatus,
  PaymentStatus,
  OrderStatus,
} from '@prisma/client';

@Injectable()
export class InvoicingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dteService: DteService,
    private readonly pdfService: PdfService,
  ) {}

  async generateDte(
    dto: GenerateDteDto,
    tenantId: string,
    userId?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
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
        invoices: {
          where: {
            status: {
              not: InvoiceStatus.VOID,
            },
          },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `Orden '${dto.orderId}' no encontrada.`,
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede emitir una factura para una orden cancelada.',
      );
    }

    if (order.invoices.length > 0) {
      throw new ConflictException(
        `La orden ya tiene una factura asociada: ${order.invoices[0].invoiceNumber}.`,
      );
    }

    if (!order.items.length) {
      throw new BadRequestException(
        'La orden no contiene ítems facturables.',
      );
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        isActive: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa/tenant no encontrada o inactiva.',
      );
    }

    const folio = Math.floor(
      100000 + Math.random() * 900000,
    );

    const fechaEmision = new Date()
      .toISOString()
      .substring(0, 10);

    const dtePayload: DtePayload = {
      tipoDte:
        dto.tipoDte ||
        TipoDTE.FACTURA_ELECTRONICA,
      folio,
      fechaEmision,
      fechaVencimiento:
        dto.fechaVencimiento,
      formaPago:
        dto.formaPago || '1',

      emisorRut:
        tenant.rutOrTaxId ||
        '',
      emisorRazonSocial:
        tenant.name,
      emisorGiro:
        'Venta y Arriendo de Maquinaria e Insumos Industriales',
      emisorActeco:
        465900,
      emisorDireccion:
        tenant.address ||
        '',
      emisorComuna:
        tenant.city ||
        '',
      emisorCiudad:
        tenant.city ||
        '',

      receptorRut:
        order.customer.rutOrTaxId ||
        '',
      receptorRazonSocial:
        order.customer.name,
      receptorGiro:
        'Empresa Minera / Comercial',
      receptorDireccion:
        order.customer.address ||
        '',
      receptorComuna:
        order.customer.city ||
        '',
      receptorCiudad:
        order.customer.city ||
        '',

      items: order.items.map(
        (item) => ({
          name: item.productName,
          description:
            item.productDescription ||
            item.productName,
          quantity: item.quantity,
          unitPrice: Math.round(
            Number(item.unitPrice),
          ),
          subtotal: Math.round(
            Number(item.subtotal),
          ),
          taxRate: Math.round(
            Number(item.taxRate),
          ),
        }),
      ),

      montoNeto: Math.round(
        Number(order.subtotalAmount),
      ),
      tasaIva: 19,
      montoIva: Math.round(
        Number(order.taxAmount),
      ),
      montoTotal: Math.round(
        Number(order.totalAmount),
      ),
    };

    const dteResult =
      await this.dteService.generateDte(
        dtePayload,
      );

    const { pdfUrl } =
      await this.pdfService.generateInvoicePdf(
        dtePayload,
        dteResult,
        tenantId,
      );

    const isSimulated =
      dteResult.estadoSii ===
      'ACEPTADO_SIMULADO';

    const invoiceNumber =
      `DTE-${dto.tipoDte || TipoDTE.FACTURA_ELECTRONICA}-${folio}`;

    const invoice =
      await this.prisma.invoice.create({
        data: {
          tenantId,
          orderId: order.id,
          customerId: order.customerId,
          invoiceNumber,
          status: isSimulated
            ? InvoiceStatus.DRAFT
            : InvoiceStatus.ISSUED,
          paymentStatus:
            PaymentStatus.PENDING,
          paymentMethod: null,
          pdfUrl,
          xmlUrl:
            `data:application/xml;base64,` +
            `${Buffer.from(
              dteResult.xmlContent,
            ).toString('base64')}`,
          subtotalAmount:
            Math.round(
              Number(order.subtotalAmount),
            ),
          taxAmount:
            Math.round(
              Number(order.taxAmount),
            ),
          totalAmount:
            Math.round(
              Number(order.totalAmount),
            ),
          issuedAt: isSimulated
            ? null
            : new Date(),
          dueDate:
            dto.fechaVencimiento
              ? new Date(
                  dto.fechaVencimiento,
                )
              : null,
        },
      });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'GENERATE_DTE_INVOICE',
        entityName: 'Invoice',
        entityId: invoice.id,
        newValues: {
          tipoDte: dtePayload.tipoDte,
          folio,
          invoiceNumber,
          pdfUrl,
          totalAmount:
            invoice.totalAmount,
          simulated: isSimulated,
        },
      },
    });

    return {
      message: isSimulated
        ? 'DTE generado en modo simulado. No corresponde a una emisión oficial ante el SII.'
        : 'DTE generado y emitido exitosamente.',
      invoice,
      dteResult: {
        tipoDte:
          dteResult.tipoDte,
        folio:
          dteResult.folio,
        estadoSii:
          dteResult.estadoSii,
        trackId:
          dteResult.trackId,
      },
      pdfUrl,
    };
  }

  async getInvoicePdf(
    id: string,
    tenantId: string,
  ) {
    const invoice =
      await this.prisma.invoice.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          order: true,
          customer: true,
        },
      });

    if (!invoice) {
      throw new NotFoundException(
        `Factura '${id}' no encontrada.`,
      );
    }

    return {
      invoiceNumber:
        invoice.invoiceNumber,
      pdfUrl:
        invoice.pdfUrl,
      status:
        invoice.status,
      totalAmount:
        invoice.totalAmount,
      issuedAt:
        invoice.issuedAt,
    };
  }

  async findAll(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: {
        tenantId,
      },
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(
    id: string,
    tenantId: string,
  ) {
    const invoice =
      await this.prisma.invoice.findFirst({
        where: {
          id,
          tenantId,
        },
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
      throw new NotFoundException(
        `Factura con ID '${id}' no encontrada.`,
      );
    }

    return invoice;
  }

  async create(
    createInvoiceDto: CreateInvoiceDto,
    tenantId: string,
  ) {
    const order =
      await this.prisma.order.findFirst({
        where: {
          id: createInvoiceDto.orderId,
          tenantId,
        },
        include: {
          invoices: {
            where: {
              status: {
                not: InvoiceStatus.VOID,
              },
            },
          },
        },
      });

    if (!order) {
      throw new NotFoundException(
        `Orden '${createInvoiceDto.orderId}' no encontrada dentro del tenant actual.`,
      );
    }

    if (
      order.status ===
      OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'No se puede crear una factura para una orden cancelada.',
      );
    }

    if (order.invoices.length > 0) {
      throw new ConflictException(
        `La orden ya tiene una factura asociada: ${order.invoices[0].invoiceNumber}.`,
      );
    }

    const subtotalAmount =
      Math.round(
        Number(order.subtotalAmount),
      );

    const taxAmount =
      Math.round(
        Number(order.taxAmount),
      );

    const totalAmount =
      Math.round(
        Number(order.totalAmount),
      );

    const calculatedTotal =
      subtotalAmount + taxAmount;

    if (calculatedTotal !== totalAmount) {
      throw new BadRequestException(
        'Los totales de la orden no son consistentes.',
      );
    }

    const invoiceNumber =
      `FAC-${Date.now().toString().slice(-6)}`;

    return this.prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        orderId: order.id,
        customerId: order.customerId,
        status: InvoiceStatus.DRAFT,
        paymentStatus:
          PaymentStatus.PENDING,
        subtotalAmount,
        taxAmount,
        totalAmount,
        dueDate:
          createInvoiceDto.dueDate
            ? new Date(
                createInvoiceDto.dueDate,
              )
            : null,
      },
    });
  }
}