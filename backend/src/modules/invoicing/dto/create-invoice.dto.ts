import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateInvoiceDto {
  @ApiPropertyOptional({ example: 'uuid-order-id', description: 'ID de la orden asociada' })
  @IsString()
  @IsOptional()
  orderId?: string;

  @ApiProperty({ example: 500000.0, description: 'Monto total de la factura' })
  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @ApiPropertyOptional({ example: 95000.0, description: 'Impuesto / IVA' })
  @IsNumber()
  @IsOptional()
  taxAmount?: number;

  @ApiPropertyOptional({ example: '2026-09-30T00:00:00.000Z', description: 'Fecha de vencimiento' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;
}
