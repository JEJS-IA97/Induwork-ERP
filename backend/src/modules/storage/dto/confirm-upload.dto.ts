import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { ProductDocumentType } from '@prisma/client';
import { StorageCategory } from './generate-presigned-url.dto';

export class ConfirmUploadDto {
  @ApiProperty({
    example: 'tenants/Coimsa/PRODUCT_IMAGE/1725100000-uuid-bomba.jpg',
    description: 'Key o ruta del archivo en el bucket S3/R2',
  })
  @IsString()
  @IsNotEmpty({ message: 'El fileKey es requerido' })
  fileKey: string;

  @ApiProperty({
    example: 'bomba-centrifuga-10hp.jpg',
    description: 'Nombre del archivo',
  })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({
    example: 'https://storage.induwork.cl/tenants/Coimsa/PRODUCT_IMAGE/1725100000-uuid-bomba.jpg',
    description: 'URL pública de acceso al archivo',
  })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'Tipo MIME del archivo',
  })
  @IsString()
  @IsNotEmpty()
  fileType: string;

  @ApiProperty({
    example: 3450890,
    description: 'Tamaño en bytes',
  })
  @IsInt()
  @IsPositive()
  fileSize: number;

  @ApiProperty({
    enum: StorageCategory,
    example: StorageCategory.PRODUCT_IMAGE,
    description: 'Categoría del archivo',
  })
  @IsEnum(StorageCategory)
  @IsNotEmpty()
  category: StorageCategory;

  @ApiPropertyOptional({
    example: 'uuid-product-id',
    description: 'ID del producto a vincular (si aplica)',
  })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({
    example: 'Ficha Técnica Oficial - Bomba 10HP',
    description: 'Título visible del documento o ficha técnica',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    enum: ProductDocumentType,
    example: ProductDocumentType.FICHA_TECNICA,
    description: 'Tipo de documento técnico',
  })
  @IsEnum(ProductDocumentType)
  @IsOptional()
  documentType?: ProductDocumentType;

  @ApiPropertyOptional({
    example: true,
    description: 'Indica si la imagen debe establecerse como imagen principal del producto',
  })
  @IsBoolean()
  @IsOptional()
  isMainImage?: boolean;

  @ApiPropertyOptional({
    example: 'Vista frontal de la bomba sumergible',
    description: 'Texto alternativo para SEO y accesibilidad',
  })
  @IsString()
  @IsOptional()
  altText?: string;
}
