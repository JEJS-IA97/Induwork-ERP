import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsNumber,
  IsPositive,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DispatchType } from '@prisma/client';

export class DispatchGuideItemDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ description: 'ID de la variante del producto' })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiPropertyOptional({ description: 'ID del lote o número de serie' })
  @IsOptional()
  @IsString()
  lotSerialId?: string;

  @ApiProperty({ description: 'Cantidad despachada' })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Precio unitario en CLP (neto)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  unitPrice?: number;
}

export class CreateDispatchGuideDto {
  @ApiProperty({
    enum: DispatchType,
    description: 'Tipo de traslado DTE 52: VENTA, TRASLADO_INTERNO, CONSIGNACION, REPARACION_MANTENCION, DEVOLUCION',
  })
  @IsEnum(DispatchType)
  dispatchType: DispatchType;

  @ApiPropertyOptional({ description: 'ID de la Orden de Venta asociada' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: 'ID de la Transferencia de Bodega asociada' })
  @IsOptional()
  @IsString()
  transferId?: string;

  @ApiPropertyOptional({ description: 'ID del cliente o receptor' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Bodega de origen (default: BODEGA_CENTRAL)' })
  @IsOptional()
  @IsString()
  originWarehouse?: string;

  @ApiPropertyOptional({ description: 'Bodega de destino (para traslados internos)' })
  @IsOptional()
  @IsString()
  destinationWarehouse?: string;

  @ApiPropertyOptional({ description: 'Dirección física de destino' })
  @IsOptional()
  @IsString()
  destinationAddress?: string;

  @ApiPropertyOptional({ description: 'RUT del transportista' })
  @IsOptional()
  @IsString()
  carrierRut?: string;

  @ApiPropertyOptional({ description: 'Nombre o razón social del transportista' })
  @IsOptional()
  @IsString()
  carrierName?: string;

  @ApiPropertyOptional({ description: 'Patente del vehículo de transporte' })
  @IsOptional()
  @IsString()
  vehiclePlate?: string;

  @ApiPropertyOptional({ description: 'Nombre del chofer' })
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional({ description: 'RUT del chofer' })
  @IsOptional()
  @IsString()
  driverRut?: string;

  @ApiProperty({ type: [DispatchGuideItemDto], description: 'Ítems del despacho' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchGuideItemDto)
  items: DispatchGuideItemDto[];
}
