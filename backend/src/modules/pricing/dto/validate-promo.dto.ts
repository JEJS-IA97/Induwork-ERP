import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CartItemDto {
  @ApiProperty({ example: 'uuid-product-id' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 100000.0 })
  @IsNumber()
  @IsPositive()
  unitPrice: number;
}

export class ValidatePromoDto {
  @ApiPropertyOptional({
    example: 'DESCUENTO10',
    description: 'Código de cupón o código promocional introducido por el cliente',
  })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 300000.0, description: 'Monto subtotal de la orden' })
  @IsNumber()
  @IsPositive()
  orderAmount: number;

  @ApiPropertyOptional({ example: 'uuid-customer-id', description: 'ID del cliente' })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ type: [CartItemDto], description: 'Ítems en el carrito de compra' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  @IsOptional()
  items?: CartItemDto[];
}
