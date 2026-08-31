import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @ApiProperty({ example: 'uuid-product-id', description: 'ID del producto' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ example: 'uuid-variant-id', description: 'ID de la variante (opcional)' })
  @IsString()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ example: 2, description: 'Cantidad solicitada' })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 120000.0, description: 'Precio unitario acordado' })
  @IsNumber()
  @IsPositive()
  unitPrice: number;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ example: 'uuid-customer-id', description: 'ID del cliente registrado' })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ example: 'Minera Los Andes S.A.', description: 'Nombre o Razón social del cliente' })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({ example: 'adquisiciones@minera-andes.cl', description: 'Email del cliente' })
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @ApiProperty({ type: [OrderItemDto], description: 'Detalle de ítems de la orden' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
