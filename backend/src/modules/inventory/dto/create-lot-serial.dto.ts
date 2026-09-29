import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LotSerialType } from '@prisma/client';

export class CreateLotSerialDto {
  @ApiProperty({ description: 'ID del producto al que pertenece el lote o serie' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ description: 'ID de variante del producto' })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ description: 'Número de lote o número de serie único (ej: SN-2026-BOMBA-9942, LOTE-2026-03)' })
  @IsString()
  lotOrSerialNumber: string;

  @ApiPropertyOptional({
    enum: LotSerialType,
    description: 'Tipo de trazabilidad: SERIAL (unidad única) o LOT (lote por volumen)',
    default: LotSerialType.SERIAL,
  })
  @IsOptional()
  @IsEnum(LotSerialType)
  type?: LotSerialType;

  @ApiPropertyOptional({ description: 'Cantidad inicial de unidades (default: 1)', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  initialQuantity?: number;

  @ApiPropertyOptional({ description: 'Bodega donde se almacena el lote/serie (default: BODEGA_CENTRAL)' })
  @IsOptional()
  @IsString()
  warehouseLocation?: string;

  @ApiPropertyOptional({ description: 'Fecha de vencimiento (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @ApiPropertyOptional({ description: 'Fecha de término de garantía (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  warrantyEndDate?: string;

  @ApiPropertyOptional({ description: 'ID de Orden de Compra asociada al ingreso' })
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;
}
