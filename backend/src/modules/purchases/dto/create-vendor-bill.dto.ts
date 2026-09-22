import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateVendorBillDto {
  @ApiProperty({
    example: 'FAC-PROV-99812',
    description: 'Folio / Número de Factura emitida por el proveedor',
  })
  @IsString()
  @IsNotEmpty({ message: 'El número de factura del proveedor es obligatorio' })
  billNumber: string;

  @ApiProperty({
    example: 'cust-uuid-prov-1234',
    description: 'ID del proveedor',
  })
  @IsUUID('4')
  @IsNotEmpty()
  supplierId: string;

  @ApiPropertyOptional({
    example: 'po-uuid-1234',
    description: 'ID de la Orden de Compra asociada para 3-Way Matching',
  })
  @IsUUID('4')
  @IsOptional()
  poId?: string;

  @ApiPropertyOptional({
    example: 'receipt-uuid-5678',
    description: 'ID de la Recepción de Bodega asociada para 3-Way Matching',
  })
  @IsUUID('4')
  @IsOptional()
  receiptId?: string;

  @ApiPropertyOptional({ example: 33, description: 'Tipo DTE (33 = Factura Electrónica)', default: 33 })
  @IsInt()
  @IsOptional()
  dteType?: number;

  @ApiPropertyOptional({ example: '2026-09-22', description: 'Fecha de emisión del proveedor' })
  @IsDateString()
  @IsOptional()
  issueDate?: string;

  @ApiPropertyOptional({ example: '2026-10-22', description: 'Fecha de vencimiento para pago' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiProperty({ example: 1250000.0, description: 'Monto Neto (Subtotal) de la factura' })
  @IsNumber()
  @Min(0)
  subtotalAmount: number;

  @ApiProperty({ example: 237500.0, description: 'Monto IVA 19% de la factura' })
  @IsNumber()
  @Min(0)
  taxAmount: number;

  @ApiProperty({ example: 1487500.0, description: 'Monto Total de la factura' })
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @ApiPropertyOptional({ example: 'https://r2.induwork.cl/bills/fac-99812.pdf', description: 'URL del PDF' })
  @IsString()
  @IsOptional()
  pdfUrl?: string;

  @ApiPropertyOptional({ example: 'https://r2.induwork.cl/bills/fac-99812.xml', description: 'URL del XML DTE' })
  @IsString()
  @IsOptional()
  xmlUrl?: string;
}
