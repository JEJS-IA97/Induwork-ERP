import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { ProductDocumentType } from '@prisma/client';

export enum StorageCategory {
  PRODUCT_IMAGE = 'PRODUCT_IMAGE',
  PRODUCT_DOCUMENT = 'PRODUCT_DOCUMENT', // Fichas técnicas, manuales, certificados
  SIGNATURE = 'SIGNATURE',              // Firmas digitales
  INVOICE_PDF = 'INVOICE_PDF',          // Facturas y notas de crédito
  GENERAL = 'GENERAL',                  // Adjuntos generales
}

export class GeneratePresignedUrlDto {
  @ApiProperty({
    example: 'bomba-centrifuga-10hp.jpg',
    description: 'Nombre original del archivo con su extensión',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del archivo es requerido' })
  fileName: string;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'Tipo MIME del archivo (ej: image/jpeg, image/png, image/webp, application/pdf)',
  })
  @IsString()
  @IsNotEmpty({ message: 'El tipo MIME es requerido' })
  fileType: string;

  @ApiProperty({
    example: 3450890,
    description: 'Tamaño del archivo en bytes (Máximo 12MB para imágenes, 5MB para PDFs)',
  })
  @IsInt()
  @IsPositive({ message: 'El tamaño del archivo debe ser mayor a 0 bytes' })
  fileSize: number;

  @ApiProperty({
    enum: StorageCategory,
    example: StorageCategory.PRODUCT_IMAGE,
    description: 'Categoría y destino del archivo en el bucket de almacenamiento',
  })
  @IsEnum(StorageCategory, {
    message:
      'La categoría debe ser una de: PRODUCT_IMAGE, PRODUCT_DOCUMENT, SIGNATURE, INVOICE_PDF, GENERAL',
  })
  @IsNotEmpty()
  category: StorageCategory;

  @ApiPropertyOptional({
    example: 'uuid-product-id',
    description: 'ID del producto al que se asociará la imagen o ficha técnica',
  })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({
    enum: ProductDocumentType,
    example: ProductDocumentType.FICHA_TECNICA,
    description: 'Tipo de documento si la categoría es PRODUCT_DOCUMENT',
  })
  @IsEnum(ProductDocumentType)
  @IsOptional()
  documentType?: ProductDocumentType;
}
