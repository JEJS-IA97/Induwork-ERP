import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { PromotionType, DiscountType } from '@prisma/client';

export class CreatePromotionDto {
  @ApiProperty({
    example: 'Envío Gratis en compras sobre $50.000',
    description: 'Nombre del programa promocional',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la promoción es requerido' })
  name: string;

  @ApiPropertyOptional({
    example: 'DESCUENTO10',
    description: 'Código de cupón / promoción (si aplica)',
  })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty({
    enum: PromotionType,
    example: PromotionType.FREE_SHIPPING,
    description:
      'Tipo: PROMO_CODE, AUTOMATIC_DISCOUNT, FREE_SHIPPING, BUY_X_GET_Y, NEXT_ORDER_COUPON, LOYALTY_PROGRAM',
  })
  @IsEnum(PromotionType)
  @IsNotEmpty()
  type: PromotionType;

  @ApiProperty({
    enum: DiscountType,
    example: DiscountType.FREE_SHIPPING,
    description: 'Tipo de descuento: PERCENTAGE, FIXED_AMOUNT, FREE_SHIPPING, FREE_PRODUCT',
    default: DiscountType.PERCENTAGE,
  })
  @IsEnum(DiscountType)
  @IsNotEmpty()
  discountType: DiscountType;

  @ApiPropertyOptional({
    example: 10.0,
    description: 'Valor del descuento (ej: 10 para 10%, o 5000 para $5.000 CLP)',
    default: 0.0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountValue?: number;

  @ApiPropertyOptional({
    example: 50000.0,
    description: 'Monto mínimo de la orden para activar la promoción (ej: $50.000 para envío gratis)',
  })
  @IsNumber()
  @IsOptional()
  minOrderAmount?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Cantidad a comprar (ej: Compre 2 productos...)',
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  buyQuantity?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Cantidad que recibe gratis (ej: ...y lleve el 3ro gratis)',
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  getQuantity?: number;

  @ApiPropertyOptional({
    example: 'prod-uuid-1234',
    description: 'ID de producto que se entrega de regalo (si aplica)',
  })
  @IsString()
  @IsOptional()
  rewardProductId?: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Meta de compras para tarjeta de lealtad (ej: Compre 10 para obtener 10% en el 11°)',
  })
  @IsInt()
  @IsOptional()
  loyaltyTargetCount?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Límite de usos máximos permitidos para el cupón/promoción',
  })
  @IsInt()
  @IsOptional()
  maxUsageCount?: number;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Fecha de inicio de la promoción' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Fecha de expiración' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
