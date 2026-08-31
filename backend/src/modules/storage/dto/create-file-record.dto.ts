import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, IsUrl } from 'class-validator';

export class CreateFileRecordDto {
  @ApiProperty({ example: 'factura-electronica-001.pdf', description: 'Nombre original del archivo' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ example: 'https://storage.induwork.cl/uploads/docs/factura-001.pdf', description: 'URL de acceso al archivo' })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiProperty({ example: 'application/pdf', description: 'Tipo MIME del archivo' })
  @IsString()
  @IsNotEmpty()
  fileType: string;

  @ApiProperty({ example: 1048576, description: 'Tamaño en bytes' })
  @IsInt()
  @IsPositive()
  fileSize: number;

  @ApiPropertyOptional({ example: 'adjuntos', description: 'Categoría o etiqueta' })
  @IsString()
  @IsOptional()
  category?: string;
}
