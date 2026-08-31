import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'IND-PUMP-001', description: 'Código SKU único del producto por tenant' })
  @IsString()
  @IsNotEmpty({ message: 'El SKU es requerido' })
  sku: string;

  @ApiProperty({ example: 'Bomba Centrífuga Industrial 5HP', description: 'Nombre del producto' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del producto es requerido' })
  name: string;

  @ApiPropertyOptional({ example: 'Bomba para líquidos corrosivos trifásica', description: 'Descripción' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Maquinaria', description: 'Categoría' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ example: 450000.0, description: 'Precio de venta' })
  @IsNumber()
  @IsPositive({ message: 'El precio debe ser un número positivo' })
  price: number;

  @ApiPropertyOptional({ example: 320000.0, description: 'Costo de adquisición' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  cost?: number;
}
