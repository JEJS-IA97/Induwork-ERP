import { Injectable, Logger } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { StorageService } from '../../storage/storage.service';
import { DtePayload, DteGeneratedResult, TipoDTE } from './dte.service';
import { StorageCategory } from '../../storage/dto/generate-presigned-url.dto';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private readonly storageService: StorageService) {}

  /**
   * Genera el documento PDF oficial chileno (Factura/Boleta) y lo sube automáticamente a Cloudflare R2 / S3
   */
  async generateInvoicePdf(
    dtePayload: DtePayload,
    dteResult: DteGeneratedResult,
    tenantId: string,
    invoiceId?: string,
  ): Promise<{ pdfBuffer: Buffer; pdfUrl: string }> {
    const pdfBuffer = await this.buildInvoicePdfBuffer(dtePayload, dteResult);

    const fileName = `DTE_${dtePayload.tipoDte}_FOLIO_${dtePayload.folio}_${Date.now()}.pdf`;
    const fileKey = `tenants/${tenantId}/invoices/${fileName}`;

    // Subir a Storage (Cloudflare R2 / S3)
    let pdfUrl = `https://storage.induwork.cl/${fileKey}`;

    try {
      // Registrar en StorageService
      const uploadConfirm = await this.storageService.confirmUpload(
        {
          fileKey,
          fileName,
          fileUrl: pdfUrl,
          fileType: 'application/pdf',
          fileSize: pdfBuffer.length,
          category: StorageCategory.INVOICE_PDF,
        },
        tenantId,
      );
      pdfUrl = uploadConfirm.file.fileUrl;
    } catch (e) {
      this.logger.warn(`No se pudo registrar automáticamente en Storage: ${e.message}`);
    }

    return {
      pdfBuffer,
      pdfUrl,
    };
  }

  /**
   * Construye el documento PDF con formato oficial chileno (Recuadro rojo SII, RUT, IVA 19%, Timbre TED)
   */
  private buildInvoicePdfBuffer(
    payload: DtePayload,
    dteResult: DteGeneratedResult,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const getDteTitle = (tipo: TipoDTE): string => {
        switch (tipo) {
          case TipoDTE.FACTURA_ELECTRONICA:
            return 'FACTURA ELECTRÓNICA';
          case TipoDTE.BOLETA_ELECTRONICA:
            return 'BOLETA ELECTRÓNICA';
          case TipoDTE.NOTA_CREDITO:
            return 'NOTA DE CRÉDITO ELECTRÓNICA';
          case TipoDTE.GUIA_DESPACHO:
            return 'GUÍA DE DESPACHO ELECTRÓNICA';
          default:
            return 'DOCUMENTO TRIBUTARIO';
        }
      };

      // -------------------------------------------------------------
      // 1. ENCABEZADO: Datos del Emisor y Recuadro Rojo Oficial del SII
      // -------------------------------------------------------------
      const topY = 40;

      // Columna Izquierda: Datos Emisor
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#1E293B')
        .text(payload.emisorRazonSocial.toUpperCase(), 40, topY);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#475569')
        .text(`Giro: ${payload.emisorGiro}`, 40, topY + 20, { width: 280 })
        .text(`Casa Matriz: ${payload.emisorDireccion}`, 40, topY + 45, { width: 280 })
        .text(`${payload.emisorComuna}, ${payload.emisorCiudad}`, 40, topY + 60);

      // Columna Derecha: Recuadro Rojo Oficial SII
      const boxX = 350;
      const boxY = topY;
      const boxWidth = 200;
      const boxHeight = 85;

      doc
        .lineWidth(2)
        .strokeColor('#DC2626') // Rojo oficial SII
        .rect(boxX, boxY, boxWidth, boxHeight)
        .stroke();

      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#DC2626')
        .text(`R.U.T.: ${payload.emisorRut}`, boxX, boxY + 12, {
          width: boxWidth,
          align: 'center',
        })
        .fontSize(10)
        .text(getDteTitle(payload.tipoDte), boxX, boxY + 30, {
          width: boxWidth,
          align: 'center',
        })
        .fontSize(13)
        .text(`N° ${payload.folio}`, boxX, boxY + 48, {
          width: boxWidth,
          align: 'center',
        })
        .fontSize(8)
        .font('Helvetica')
        .text('S.I.I. - SANTIAGO CENTRO', boxX, boxY + 68, {
          width: boxWidth,
          align: 'center',
        });

      // -------------------------------------------------------------
      // 2. DATOS DEL RECEPTOR (CLIENTE)
      // -------------------------------------------------------------
      const clientBoxY = 145;
      doc
        .lineWidth(0.5)
        .strokeColor('#CBD5E1')
        .rect(40, clientBoxY, 510, 75)
        .stroke();

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#0F172A')
        .text('SEÑOR(ES):', 50, clientBoxY + 10)
        .font('Helvetica')
        .text(payload.receptorRazonSocial, 120, clientBoxY + 10, { width: 240 })
        .font('Helvetica-Bold')
        .text('R.U.T.:', 380, clientBoxY + 10)
        .font('Helvetica')
        .text(payload.receptorRut, 425, clientBoxY + 10)

        .font('Helvetica-Bold')
        .text('GIRO:', 50, clientBoxY + 28)
        .font('Helvetica')
        .text(payload.receptorGiro || 'COMERCIAL / PARTICULAR', 120, clientBoxY + 28, { width: 240 })
        .font('Helvetica-Bold')
        .text('FECHA:', 380, clientBoxY + 28)
        .font('Helvetica')
        .text(payload.fechaEmision, 425, clientBoxY + 28)

        .font('Helvetica-Bold')
        .text('DIRECCIÓN:', 50, clientBoxY + 46)
        .font('Helvetica')
        .text(`${payload.receptorDireccion}, ${payload.receptorComuna}`, 120, clientBoxY + 46, { width: 240 })
        .font('Helvetica-Bold')
        .text('COND. PAGO:', 380, clientBoxY + 46)
        .font('Helvetica')
        .text(payload.formaPago === '2' ? 'Crédito' : 'Contado', 450, clientBoxY + 46);

      // -------------------------------------------------------------
      // 3. TABLA DE ÍTEMS / DETALLE DE PRODUCTOS
      // -------------------------------------------------------------
      const tableY = 235;

      // Encabezado tabla
      doc
        .rect(40, tableY, 510, 20)
        .fillColor('#F1F5F9')
        .fill();

      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#334155')
        .text('DESCRIPCIÓN DEL PRODUCTO / SERVICIO', 50, tableY + 6)
        .text('CANT.', 360, tableY + 6, { width: 40, align: 'right' })
        .text('P. UNITARIO', 410, tableY + 6, { width: 60, align: 'right' })
        .text('SUBTOTAL', 480, tableY + 6, { width: 60, align: 'right' });

      let currentY = tableY + 25;

      // Filas de productos
      payload.items.forEach((item, index) => {
        const itemBg = index % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
        doc.rect(40, currentY - 3, 510, 20).fillColor(itemBg).fill();

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#0F172A')
          .text(item.name, 50, currentY, { width: 300, ellipsis: true })
          .text(`${item.quantity}`, 360, currentY, { width: 40, align: 'right' })
          .text(`$${Math.round(item.unitPrice).toLocaleString('es-CL')}`, 410, currentY, {
            width: 60,
            align: 'right',
          })
          .text(`$${Math.round(item.subtotal).toLocaleString('es-CL')}`, 480, currentY, {
            width: 60,
            align: 'right',
          });

        currentY += 20;
      });

      // -------------------------------------------------------------
      // 4. TIMBRE ELECTRÓNICO (TED) Y CUADRO DE TOTALES
      // -------------------------------------------------------------
      const footerY = Math.max(currentY + 20, 600);

      // Cuadro de Totales (Derecha)
      const totalBoxX = 350;
      const totalBoxWidth = 200;

      doc
        .lineWidth(0.5)
        .strokeColor('#CBD5E1')
        .rect(totalBoxX, footerY, totalBoxWidth, 75)
        .stroke();

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#334155')
        .text('MONTO NETO:', totalBoxX + 15, footerY + 12)
        .font('Helvetica')
        .text(`$${Math.round(payload.montoNeto).toLocaleString('es-CL')}`, totalBoxX + 100, footerY + 12, {
          width: 85,
          align: 'right',
        })
        .font('Helvetica-Bold')
        .text(`IVA (${payload.tasaIva || 19}%):`, totalBoxX + 15, footerY + 30)
        .font('Helvetica')
        .text(`$${Math.round(payload.montoIva).toLocaleString('es-CL')}`, totalBoxX + 100, footerY + 30, {
          width: 85,
          align: 'right',
        })
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#0F172A')
        .text('TOTAL:', totalBoxX + 15, footerY + 50)
        .text(`$${Math.round(payload.montoTotal).toLocaleString('es-CL')}`, totalBoxX + 100, footerY + 50, {
          width: 85,
          align: 'right',
        });

      // Timbre Electrónico DTE (TED) (Izquierda)
      if (dteResult.tedBarcodeBase64) {
        const imageBuffer = Buffer.from(
          dteResult.tedBarcodeBase64.replace(/^data:image\/\w+;base64,/, ''),
          'base64',
        );
        doc.image(imageBuffer, 40, footerY - 10, { width: 110 });
      }

      doc
        .fontSize(7)
        .font('Helvetica-Bold')
        .fillColor('#64748B')
        .text('Timbre Electrónico SII', 160, footerY + 15)
        .font('Helvetica')
        .text('Res. 99 de 2014 - Verifique documento: www.sii.cl', 160, footerY + 27, {
          width: 170,
        });

      doc.end();
    });
  }
}
