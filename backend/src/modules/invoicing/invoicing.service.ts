import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DteService, TipoDTE, DtePayload } from './services/dte.service';
import { PdfService } from './services/pdf.service';
import { GenerateDteDto } from './dto/generate-dte.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dteService: DteService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * Genera el DTE oficial, el XML, el Timbre TED y el PDF subido a Cloudflare R2
   */
  async generateDte(
    dto: GenerateDteDto,
    tenantId: string,
    userId?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, tenantId },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Orden '${dto.orderId}' no encontrada.`);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Empresa tenant no encontrada.`);
    }

    const folio = Math.floor(100000 + Math.random() * 900000); // En producción se obtiene del CAF del SII
    const fechaEmision = new Date().toISOString().substring(0, 10);

    const dtePayload: DtePayload = {
      tipoDte: dto.tipoDte || TipoDTE.FACTURA_ELECTRONICA,
      folio,
      fechaEmision,
      fechaVencimiento: dto.fechaVencimiento,
      formaPago: dto.formaPago || '1',

      // Emisor (Tenant)
      emisorRut: tenant.rutOrTaxId || '76.123.456-7',
      emisorRazonSocial: tenant.name,
      emisorGiro: 'Venta y Arriendo de Maquinaria e Insumos Industriales',
      emisorActeco: 465900,
      emisorDireccion: tenant.address || 'Av. Industrial 1000',
      emisorComuna: tenant.city || 'Santiago',
      emisorCiudad: tenant.city || 'Santiago',

      // Receptor (Customer)
      receptorRut: order.customer.rutOrTaxId || '79.999.888-7',
      receptorRazonSocial: order.customer.name,
      receptorGiro: 'Empresa Minera / Comercial',
      receptorDireccion: order.customer.address || 'Av. Central 500',
      receptorComuna: order.customer.city || 'Santiago',
      receptorCiudad: order.customer.city || 'Santiago',

      // Ítems
      items: order.items.map((item) => ({
        name: item.productName,
        description: item.productDescription || item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),

      montoNeto: Number(order.subtotalAmount),
      tasaIva: 19,
      montoIva: Number(order.taxAmount),
      montoTotal: Number(order.totalAmount),
    };

    // 1. Generar XML y Timbre TED del DTE
    const dteResult = await this.dteService.generateDte(dtePayload);

    // 2. Generar PDF Oficial y Subir a Cloudflare R2
    const { pdfUrl } = await this.pdfService.generateInvoicePdf(
      dtePayload,
      dteResult,
      tenantId,
    );

    // 3. Crear o actualizar factura en PostgreSQL
    const invoiceNumber = `DTE-${dto.tipoDte}-${folio}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        orderId: order.id,
        customerId: order.customerId,
        invoiceNumber,
        status: InvoiceStatus.ISSUED,
        paymentStatus: PaymentStatus.COMPLETED,
        paymentMethod: 'TRANSFERENCIA',
        pdfUrl,
        xmlUrl: `data:application/xml;base64,${Buffer.from(dteResult.xmlContent).toString('base64')}`,
        subtotalAmount: order.subtotalAmount,
        taxAmount: order.taxAmount,
        totalAmount: order.totalAmount,
        issuedAt: new Date(),
      },
    });

    // 4. Registro de Auditoría
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'GENERATE_DTE_INVOICE',
        entityName: 'Invoice',
        entityId: invoice.id,
        newValues: {
          tipoDte: dto.tipoDte,
          folio,
          invoiceNumber,
          pdfUrl,
          totalAmount: order.totalAmount,
        },
      },
    });

    return {
      message: 'DTE generado y emitido exitosamente.',
      invoice,
      dteResult: {
        tipoDte: dteResult.tipoDte,
        folio: dteResult.folio,
        estadoSii: dteResult.estadoSii,
        trackId: dteResult.trackId,
      },
      pdfUrl,
    };
  }

  /**
   * Obtener PDF de una factura
   */
  async getInvoicePdf(id: string, tenantId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: { order: true, customer: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Factura '${id}' no encontrada.`);
    }

    return {
      invoiceNumber: invoice.invoiceNumber,
      pdfUrl: invoice.pdfUrl,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      issuedAt: invoice.issuedAt,
    };
  }

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
