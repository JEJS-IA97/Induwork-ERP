import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePriceListDto {
  @ApiProperty({ example: 'Mayorista Minería', description: 'Nombre de la lista de precios' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la lista de precios es requerido' })
  name: string;

  @ApiProperty({ example: 'PL-MAYORISTA', description: 'Código único de la lista' })
  @IsString()
  @IsNotEmpty({ message: 'El código de la lista es requerido' })
  code: string;

  @ApiPropertyOptional({ example: 'Precios especiales para faenas mineras y distribuidores', description: 'Descripción' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'CLP', default: 'CLP', description: 'Moneda' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: false, description: 'Es la lista de precios por defecto' })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Fecha de inicio de vigencia' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Fecha de término de vigencia' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
