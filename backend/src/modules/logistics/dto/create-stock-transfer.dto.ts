import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StockTransferItemDto {
  @ApiProperty({ description: 'ID del producto a transferir' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ description: 'ID de variante del producto' })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiPropertyOptional({ description: 'ID del lote o número de serie asociado' })
  @IsOptional()
  @IsString()
  lotSerialId?: string;

  @ApiProperty({ description: 'Cantidad solicitada a transferir' })
  @IsInt()
  @Min(1)
  quantityRequested: number;
}

export class CreateStockTransferDto {
  @ApiProperty({ description: 'Bodega de origen (ej: BODEGA_CENTRAL)' })
  @IsString()
  sourceWarehouse: string;

  @ApiProperty({ description: 'Bodega de destino (ej: BODEGA_ANTOFAGASTA)' })
  @IsString()
  destinationWarehouse: string;

  @ApiProperty({ type: [StockTransferItemDto], description: 'Ítems a transferir' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items: StockTransferItemDto[];
}
