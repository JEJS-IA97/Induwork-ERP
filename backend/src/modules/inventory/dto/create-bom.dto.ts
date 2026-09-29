import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BomType } from '@prisma/client';

export class BomComponentDto {
  @ApiProperty({ description: 'ID del producto componente (materia prima o sub-ítem)' })
  @IsString()
  componentProductId: string;

  @ApiPropertyOptional({ description: 'ID de variante del componente' })
  @IsOptional()
  @IsString()
  componentVariantId?: string;

  @ApiProperty({ description: 'Cantidad requerida por cada unidad del producto padre' })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateBomDto {
  @ApiProperty({ description: 'ID del producto padre terminado o kit' })
  @IsString()
  parentProductId: string;

  @ApiPropertyOptional({ description: 'ID de la variante del producto padre' })
  @IsOptional()
  @IsString()
  parentVariantId?: string;

  @ApiProperty({ description: 'Código único de la lista de materiales (ej: BOM-KIT-BOMBA-5HP)' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Nombre descriptivo de la lista de materiales' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    enum: BomType,
    description: 'Tipo de BOM: KIT (ensamble en venta/despacho) o MANUFACTURE (fabricación industrial)',
    default: BomType.KIT,
  })
  @IsOptional()
  @IsEnum(BomType)
  type?: BomType;

  @ApiPropertyOptional({ description: 'Notas o instrucciones de ensamble' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [BomComponentDto], description: 'Lista de componentes necesarios' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomComponentDto)
  components: BomComponentDto[];
}

export class AssembleKitDto {
  @ApiProperty({ description: 'Cantidad de unidades del kit a ensamblar' })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Ubicación de bodega donde se realiza el ensamble (default: BODEGA_CENTRAL)' })
  @IsOptional()
  @IsString()
  warehouseLocation?: string;
}
