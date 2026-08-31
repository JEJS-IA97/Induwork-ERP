import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 'uuid-invoice-id', description: 'ID de la factura asociada' })
  @IsString()
  @IsNotEmpty({ message: 'El ID de la factura es requerido' })
  invoiceId: string;

  @ApiProperty({ example: 500000.0, description: 'Monto pagado' })
  @IsNumber()
  @IsPositive({ message: 'El monto debe ser mayor a cero' })
  amount: number;

  @ApiPropertyOptional({ example: 'TRANSFER', description: 'Método de pago (TRANSFER, CASH, CREDIT_CARD)' })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'TRX-987654321', description: 'Número o comprobante de transacción bancaria' })
  @IsString()
  @IsOptional()
  transactionRef?: string;
}
