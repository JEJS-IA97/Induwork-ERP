import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TipoDTE } from '../services/dte.service';

export class GenerateDteDto {
  @ApiProperty({ example: 'uuid-order-id', description: 'ID de la orden de venta pagada' })
  @IsString()
  @IsNotEmpty({ message: 'El ID de la orden es requerido' })
  orderId: string;

  @ApiProperty({
    enum: TipoDTE,
    example: TipoDTE.FACTURA_ELECTRONICA,
    description: 'Tipo de DTE chileno (33: Factura Electrónica, 39: Boleta Electrónica, 61: Nota de Crédito, 52: Guía de Despacho)',
    default: TipoDTE.FACTURA_ELECTRONICA,
  })
  @IsEnum(TipoDTE)
  @IsNotEmpty()
  tipoDte: TipoDTE;

  @ApiPropertyOptional({ example: '1', description: 'Forma de pago (1: Contado, 2: Crédito)' })
  @IsString()
  @IsOptional()
  formaPago?: string;

  @ApiPropertyOptional({ example: '2026-10-30', description: 'Fecha de vencimiento si es crédito (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  fechaVencimiento?: string;
}
