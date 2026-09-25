import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CartItemDto {
  @ApiProperty({
    example: 'uuid-product-id',
    description:
      'ID del producto existente en el tenant.',
  })
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({
    example: 'uuid-variant-id',
    description:
      'ID de la variante específica, si aplica.',
  })
  @IsUUID('4')
  @IsOptional()
  variantId?: string;

  @ApiProperty({
    example: 3,
    description:
      'Cantidad solicitada.',
  })
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class ValidatePromoDto {
  @ApiPropertyOptional({
    example: 'DESCUENTO10',
    description:
      'Código de cupón o promoción.',
  })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({
    example: 'uuid-customer-id',
    description:
      'Cliente al que pertenece la compra. El servidor valida que pertenezca al tenant.',
  })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiProperty({
    type: [CartItemDto],
    description:
      'Ítems del carrito. Los precios son resueltos por el servidor.',
  })
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => CartItemDto)
  items: CartItemDto[];
}