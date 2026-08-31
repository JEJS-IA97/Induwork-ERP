import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export enum StockMovementType {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
  AJUSTE = 'AJUSTE',
}

export class CreateMovementDto {
  @ApiProperty({ example: 'uuid-product-id', description: 'ID del producto' })
  @IsString()
  @IsNotEmpty({ message: 'El ID del producto es requerido' })
  productId: string;

  @ApiPropertyOptional({ example: 'uuid-variant-id', description: 'ID de la variante (opcional)' })
  @IsString()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ enum: StockMovementType, example: StockMovementType.ENTRADA, description: 'Tipo de movimiento' })
  @IsEnum(StockMovementType)
  @IsNotEmpty()
  type: StockMovementType;

  @ApiProperty({ example: 50, description: 'Cantidad a mover' })
  @IsInt()
  @IsPositive({ message: 'La cantidad debe ser mayor a cero' })
  quantity: number;

  @ApiPropertyOptional({ example: 'BODEGA_CENTRAL', description: 'Bodega o almacén' })
  @IsString()
  @IsOptional()
  warehouseLocation?: string;

  @ApiPropertyOptional({ example: 'Ingreso por compra a proveedor', description: 'Motivo / Referencia' })
  @IsString()
  @IsOptional()
  reference?: string;
}
