import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

export enum TipoDTE {
  FACTURA_ELECTRONICA = 33,
  FACTURA_EXENTA = 34,
  BOLETA_ELECTRONICA = 39,
  BOLETA_EXENTA = 41,
  GUIA_DESPACHO = 52,
  NOTA_CREDITO = 61,
  NOTA_DEBITO = 56,
}

export interface DteItem {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxRate?: number;
}

export interface DtePayload {
  tipoDte: TipoDTE;
  folio: number;
  fechaEmision: string; // YYYY-MM-DD
  fechaVencimiento?: string;
  formaPago?: string; // '1' = Contado, '2' = Crédito
  
  // Emisor
  emisorRut: string;
  emisorRazonSocial: string;
  emisorGiro: string;
  emisorActeco?: number;
  emisorDireccion: string;
  emisorComuna: string;
  emisorCiudad: string;

  // Receptor
  receptorRut: string;
  receptorRazonSocial: string;
  receptorGiro?: string;
  receptorDireccion: string;
  receptorComuna: string;
  receptorCiudad: string;

  // Ítems y Totales
  items: DteItem[];
  montoNeto: number;
  tasaIva: number; // 19
  montoIva: number;
  montoTotal: number;
}

export interface DteGeneratedResult {
  tipoDte: TipoDTE;
  folio: number;
  xmlContent: string;
  tedXml: string;
  tedBarcodeBase64: string; // Imagen en Base64 para incrustar en el PDF
  trackId?: string;
  estadoSii: string;
}

@Injectable()
export class DteService {
  private readonly logger = new Logger(DteService.name);

  /**
   * Genera el DTE oficial chileno (Tipo 33, 39, 61, etc.) con estructura XML del SII y Timbre Electrónico TED
   */
  async generateDte(payload: DtePayload): Promise<DteGeneratedResult> {
    this.validateDtePayload(payload);

    const docId = `DTE_T${payload.tipoDte}_F${payload.folio}`;
    const tedXml = this.buildTedXml(payload);
    const tedBarcodeBase64 = await this.generateTedBarcodeImage(tedXml);

    const xmlContent = `<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">
  <Documento ID="${docId}">
    <Encabezado>
      <IdDoc>
        <TipoDTE>${payload.tipoDte}</TipoDTE>
        <Folio>${payload.folio}</Folio>
        <FchEmis>${payload.fechaEmision}</FchEmis>
        <FmaPago>${payload.formaPago || '1'}</FmaPago>
        ${payload.fechaVencimiento ? `<FchVenc>${payload.fechaVencimiento}</FchVenc>` : ''}
      </IdDoc>
      <Emisor>
        <RUTEmisor>${payload.emisorRut}</RUTEmisor>
        <RznSoc>${this.escapeXml(payload.emisorRazonSocial)}</RznSoc>
        <GiroEmis>${this.escapeXml(payload.emisorGiro)}</GiroEmis>
        <Acteco>${payload.emisorActeco || 465900}</Acteco>
        <DirOrigen>${this.escapeXml(payload.emisorDireccion)}</DirOrigen>
        <CmnaOrigen>${this.escapeXml(payload.emisorComuna)}</CmnaOrigen>
        <CiudadOrigen>${this.escapeXml(payload.emisorCiudad)}</CiudadOrigen>
      </Emisor>
      <Receptor>
        <RUTRecep>${payload.receptorRut}</RUTRecep>
        <RznSocRecep>${this.escapeXml(payload.receptorRazonSocial)}</RznSocRecep>
        <GiroRecep>${this.escapeXml(payload.receptorGiro || 'Particular / Comercial')}</GiroRecep>
        <DirRecep>${this.escapeXml(payload.receptorDireccion)}</DirRecep>
        <CmnaRecep>${this.escapeXml(payload.receptorComuna)}</CmnaRecep>
        <CiudadRecep>${this.escapeXml(payload.receptorCiudad)}</CiudadRecep>
      </Receptor>
      <Totales>
        <MntNeto>${Math.round(payload.montoNeto)}</MntNeto>
        <TasaIVA>${payload.tasaIva || 19}</TasaIVA>
        <IVA>${Math.round(payload.montoIva)}</IVA>
        <MntTotal>${Math.round(payload.montoTotal)}</MntTotal>
      </Totales>
    </Encabezado>
    <Detalle>
      ${payload.items
        .map(
          (item, idx) => `
      <Item>
        <NroLinDet>${idx + 1}</NroLinDet>
        <NmbItem>${this.escapeXml(item.name)}</NmbItem>
        <DscItem>${this.escapeXml(item.description || item.name)}</DscItem>
        <QtyItem>${item.quantity}</QtyItem>
        <PrcItem>${Math.round(item.unitPrice)}</PrcItem>
        <MontoItem>${Math.round(item.subtotal)}</MontoItem>
      </Item>`,
        )
        .join('')}
    </Detalle>
    ${tedXml}
    <TmstFirma>${new Date().toISOString()}</TmstFirma>
  </Documento>
</DTE>`;

    const trackId = `TRACK-${Date.now()}-${payload.folio}`;

    this.logger.log(
      `✅ DTE Tipo ${payload.tipoDte} Folio ${payload.folio} generado para ${payload.receptorRazonSocial} (RUT: ${payload.receptorRut})`,
    );

    return {
      tipoDte: payload.tipoDte,
      folio: payload.folio,
      xmlContent,
      tedXml,
      tedBarcodeBase64,
      trackId,
      estadoSii: 'ACEPTADO_SIMULADO',
    };
  }

  /**
   * Construye el bloque del Timbre Electrónico DTE (TED)
   */
  private buildTedXml(payload: DtePayload): string {
    const primerItem = payload.items[0]?.name?.substring(0, 40) || 'Productos Varios';
    const timestamp = new Date().toISOString().substring(0, 19);

    // Firma simulada del digest del documento para el CAF
    const dataToSign = `${payload.emisorRut}|${payload.tipoDte}|${payload.folio}|${payload.fechaEmision}|${payload.receptorRut}|${Math.round(payload.montoTotal)}|${primerItem}|${timestamp}`;
    const digitalSignature = crypto
      .createHash('sha256')
      .update(dataToSign)
      .digest('base64');

    return `
    <TED version="1.0">
      <DD>
        <RE>${payload.emisorRut}</RE>
        <TD>${payload.tipoDte}</TD>
        <F>${payload.folio}</F>
        <FE>${payload.fechaEmision}</FE>
        <RR>${payload.receptorRut}</RR>
        <RSR>${this.escapeXml(payload.receptorRazonSocial.substring(0, 40))}</RSR>
        <MNT>${Math.round(payload.montoTotal)}</MNT>
        <IT1>${this.escapeXml(primerItem)}</IT1>
        <CAF version="1.0">
          <DA>
            <RE>${payload.emisorRut}</RE>
            <RS>${this.escapeXml(payload.emisorRazonSocial.substring(0, 40))}</RS>
            <TD>${payload.tipoDte}</TD>
            <RNG><D>1</D><H>100000</H></RNG>
            <FA>${payload.fechaEmision}</FA>
            <RSAPK><M>simulated_rsa_public_key</M><E>AQAB</E></RSAPK>
          </DA>
          <FRMA algoritmo="SHA1withRSA">simulated_caf_signature_base64</FRMA>
        </CAF>
        <TSTED>${timestamp}</TSTED>
      </DD>
      <FRMT algoritmo="SHA1withRSA">${digitalSignature}</FRMT>
    </TED>`;
  }

  /**
   * Genera el código de timbre bidimensional en Base64 para el PDF
   */
  private async generateTedBarcodeImage(tedXml: string): Promise<string> {
    try {
      const qrData = tedXml.replace(/\s+/g, ' ').trim();
      return await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 180,
      });
    } catch (e) {
      this.logger.error('Error generando timbre TED barcode:', e);
      return '';
    }
  }

  private validateDtePayload(payload: DtePayload) {
    if (!payload.tipoDte) throw new BadRequestException('El tipo de DTE es requerido.');
    if (!payload.folio) throw new BadRequestException('El folio del DTE es requerido.');
    if (!payload.emisorRut) throw new BadRequestException('El RUT del emisor es requerido.');
    if (!payload.receptorRut) throw new BadRequestException('El RUT del receptor es requerido.');
    if (!payload.items || payload.items.length === 0) {
      throw new BadRequestException('El DTE debe contener al menos un ítem.');
    }
  }

  private escapeXml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
