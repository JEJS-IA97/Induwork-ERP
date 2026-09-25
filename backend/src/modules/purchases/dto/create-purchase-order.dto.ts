import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
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
import { PurchaseOrderStatus } from '@prisma/client';

export class PurchaseOrderItemDto {
  @ApiProperty({
    example: 'prod-uuid-1234',
    description: 'ID del producto.',
  })
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({
    example: 'variant-uuid-5678',
    description:
      'ID de variante específica, si aplica.',
  })
  @IsUUID('4')
  @IsOptional()
  variantId?: string;

  @ApiProperty({
    example:
      'Bomba Centrífuga 5HP 380V',
    description:
      'Nombre descriptivo enviado por el cliente. El backend utiliza el nombre oficial del producto.',
  })
  @IsString()
  @IsNotEmpty()
  productName: string;

  @ApiProperty({
    example: 10,
    description:
      'Cantidad solicitada.',
  })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({
    example: 125000.0,
    description:
      'Costo unitario pactado con el proveedor.',
  })
  @IsNumber()
  @Min(0)
  unitCost: number;

  @ApiPropertyOptional({
    example: 19.0,
    description:
      'Tasa de impuesto IVA (%).',
    default: 19.0,
  })
  @IsNumber()
  @IsOptional()
  taxRate?: number;
}

export class CreatePurchaseOrderDto {
  @ApiPropertyOptional({
    example:
      'OC-2026-0001',
    description:
      'Número de orden de compra. Se genera automáticamente si se omite.',
  })
  @IsString()
  @IsOptional()
  poNumber?: string;

  @ApiProperty({
    example:
      'cust-uuid-prov-1234',
    description:
      'ID del proveedor.',
  })
  @IsUUID('4')
  @IsNotEmpty({
    message:
      'El ID del proveedor es obligatorio',
  })
  supplierId: string;

  @ApiPropertyOptional({
    enum: PurchaseOrderStatus,
    example:
      PurchaseOrderStatus.RFQ,
    description:
      'Estado inicial. Las nuevas órdenes siempre deben comenzar en RFQ.',
    default:
      PurchaseOrderStatus.RFQ,
  })
  @IsEnum(PurchaseOrderStatus)
  @IsOptional()
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional({
    example:
      '2026-09-30',
    description:
      'Fecha esperada de entrega.',
  })
  @IsDateString()
  @IsOptional()
  expectedDate?: string;

  @ApiPropertyOptional({
    example:
      'Entrega en Bodega Central.',
    description:
      'Términos y notas de la compra.',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({
    type: [PurchaseOrderItemDto],
    description:
      'Ítems solicitados al proveedor.',
  })
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}