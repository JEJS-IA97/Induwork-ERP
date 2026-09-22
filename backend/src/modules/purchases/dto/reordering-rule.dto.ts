import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateReorderingRuleDto {
  @ApiProperty({ example: 'prod-uuid-1234', description: 'ID del producto' })
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ example: 'variant-uuid-5678', description: 'ID de variante (opcional)' })
  @IsUUID('4')
  @IsOptional()
  variantId?: string;

  @ApiPropertyOptional({
    example: 'BODEGA_CENTRAL',
    description: 'Bodega donde aplica la regla',
    default: 'BODEGA_CENTRAL',
  })
  @IsString()
  @IsOptional()
  warehouseLocation?: string;

  @ApiProperty({ example: 5, description: 'Stock mínimo para disparar alerta/orden' })
  @IsInt()
  @Min(0)
  minStock: number;

  @ApiProperty({ example: 50, description: 'Stock máximo objetivo en bodega' })
  @IsInt()
  @IsPositive()
  maxStock: number;

  @ApiProperty({ example: 20, description: 'Cantidad sugerida a pedir en la OC' })
  @IsInt()
  @IsPositive()
  qtyToOrder: number;

  @ApiPropertyOptional({
    example: 'cust-uuid-prov-1234',
    description: 'ID del proveedor preferido para compras automáticas',
  })
  @IsUUID('4')
  @IsOptional()
  preferredSupplierId?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateVendorPriceDto {
  @ApiProperty({ example: 'cust-uuid-prov-1234', description: 'ID del proveedor' })
  @IsUUID('4')
  @IsNotEmpty()
  supplierId: string;

  @ApiProperty({ example: 'prod-uuid-1234', description: 'ID del producto' })
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ example: 'variant-uuid-5678', description: 'ID de variante (opcional)' })
  @IsUUID('4')
  @IsOptional()
  variantId?: string;

  @ApiPropertyOptional({ example: 'PROV-SKU-9912', description: 'Código del producto según el proveedor' })
  @IsString()
  @IsOptional()
  supplierSku?: string;

  @ApiProperty({ example: 120000.0, description: 'Costo unitario pactado' })
  @IsNumber()
  @Min(0)
  unitCost: number;

  @ApiPropertyOptional({ example: 1, description: 'Cantidad mínima para este costo', default: 1 })
  @IsInt()
  @IsPositive()
  @IsOptional()
  minQuantity?: number;

  @ApiPropertyOptional({ example: 3, description: 'Tiempo de entrega en días hábiles (lead time)', default: 3 })
  @IsInt()
  @Min(0)
  @IsOptional()
  deliveryLeadDays?: number;

  @ApiPropertyOptional({ example: 'CLP', default: 'CLP' })
  @IsString()
  @IsOptional()
  currency?: string;
}
