import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PriceAdjustmentType } from '@prisma/client';

export class BulkPriceAdjustmentDto {
  @ApiPropertyOptional({
    example: 'uuid-price-list-id',
    description: 'ID de la lista de precios a modificar (si es null, actualiza los precios base del catálogo)',
  })
  @IsString()
  @IsOptional()
  priceListId?: string;

  @ApiProperty({
    enum: PriceAdjustmentType,
    example: PriceAdjustmentType.PERCENTAGE_INCREASE,
    description: 'Tipo de ajuste: PERCENTAGE_INCREASE (+%), PERCENTAGE_DISCOUNT (-%), FIXED_PRICE ($)',
  })
  @IsEnum(PriceAdjustmentType)
  @IsNotEmpty()
  adjustmentType: PriceAdjustmentType;

  @ApiProperty({
    example: 15.0,
    description: 'Porcentaje o valor a aplicar (ej: 15 para +15% de aumento, o 10 para 10% de descuento)',
  })
  @IsNumber()
  @IsNotEmpty()
  value: number;

  @ApiPropertyOptional({
    example: 'uuid-category-id',
    description: 'Filtrar solo productos de una categoría específica',
  })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    example: ['uuid-prod-1', 'uuid-prod-2'],
    description: 'Lista específica de IDs de productos a modificar',
  })
  @IsArray()
  @IsOptional()
  productIds?: string[];

  @ApiPropertyOptional({
    example: true,
    description: 'Si es true, actualiza directamente el precio base en la tabla Product',
  })
  @IsBoolean()
  @IsOptional()
  applyToBaseProducts?: boolean;
}
