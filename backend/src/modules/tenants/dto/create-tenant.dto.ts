import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({
    example: 'Coimsa',
    description: 'Identificador o código único de la empresa (slug)',
  })
  @IsString()
  @IsNotEmpty({ message: 'El código de la empresa es requerido' })
  code: string;

  @ApiProperty({
    example: 'Coimsa SpA',
    description: 'Razón social o nombre de la empresa',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la empresa es requerido' })
  name: string;

  @ApiPropertyOptional({
    example: 'CL-76.123.456-7',
    description: 'RUT o identificación tributaria',
  })
  @IsString()
  @IsOptional()
  taxId?: string;

  @ApiPropertyOptional({
    example: 'contacto@Coimsa.cl',
    description: 'Correo electrónico de contacto de la empresa',
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: 'Av. Industrial 1000, Santiago',
    description: 'Dirección física de la empresa',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    example: '+56 2 2222 1111',
    description: 'Teléfono de contacto',
  })
  @IsString()
  @IsOptional()
  phone?: string;
}
