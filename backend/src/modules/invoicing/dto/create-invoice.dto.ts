import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class CreateInvoiceDto {
  @ApiProperty({
    example: 'uuid-order-id',
    description: 'ID de la orden asociada',
  })
  @IsString()
  @IsNotEmpty({
    message: 'El ID de la orden es obligatorio',
  })
  orderId: string;

  @ApiProperty({
    example: '2026-09-30T00:00:00.000Z',
    description: 'Fecha de vencimiento de la factura',
    required: false,
  })
  @IsDateString()
  dueDate?: string;
}