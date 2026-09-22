import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GoodsReceiptItemDto {
  @ApiProperty({ example: 'prod-uuid-1234', description: 'ID del producto recibido' })
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ example: 'variant-uuid-5678', description: 'ID de variante recibida' })
  @IsUUID('4')
  @IsOptional()
  variantId?: string;

  @ApiProperty({ example: 10, description: 'Cantidad efectivamente recibida en bodega' })
  @IsInt()
  @IsPositive()
  quantityReceived: number;

  @ApiProperty({ example: 125000.0, description: 'Costo unitario del producto recibido (CLP)' })
  @IsNumber()
  @Min(0)
  unitCost: number;

  @ApiPropertyOptional({
    example: 'SN-2026-BOMBA-9942',
    description: 'Número de Serie o Lote ingresado (opcional)',
  })
  @IsString()
  @IsOptional()
  lotOrSerialNumber?: string;
}

export class CreateGoodsReceiptDto {
  @ApiPropertyOptional({
    example: 'po-uuid-1234',
    description: 'ID de la Orden de Compra asociada (si aplica)',
  })
  @IsUUID('4')
  @IsOptional()
  poId?: string;

  @ApiProperty({ example: 'cust-uuid-prov-1234', description: 'ID del proveedor' })
  @IsUUID('4')
  @IsNotEmpty()
  supplierId: string;

  @ApiPropertyOptional({
    example: 'BODEGA_CENTRAL',
    description: 'Bodega de destino donde ingresa la mercadería',
    default: 'BODEGA_CENTRAL',
  })
  @IsString()
  @IsOptional()
  warehouseLocation?: string;

  @ApiPropertyOptional({
    example: 'Recepción conforme contra Guía de Despacho Proveedor N° 45812',
    description: 'Notas de recepción en bodega',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({
    type: [GoodsReceiptItemDto],
    description: 'Listado de productos recibidos físicamente',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items: GoodsReceiptItemDto[];
}
