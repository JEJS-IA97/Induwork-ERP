import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/constants/roles.enum';

export class RegisterDto {
  @ApiProperty({
    example: 'usuario@induwork.cl',
    description: 'Correo electrónico único del usuario',
  })
  @IsEmail({}, { message: 'El correo electrónico debe ser una dirección válida' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email: string;

  @ApiProperty({
    example: 'ClaveSegura2026!',
    description: 'Contraseña segura del usuario',
    minLength: 8,
  })
  @IsString({ message: 'La contraseña debe ser un texto válido' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @ApiProperty({
    example: 'Juan',
    description: 'Nombre del usuario',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  firstName: string;

  @ApiProperty({
    example: 'Pérez',
    description: 'Apellido del usuario',
  })
  @IsString()
  @IsNotEmpty({ message: 'El apellido es requerido' })
  lastName: string;

  @ApiProperty({
    enum: Role,
    example: Role.VENDEDOR,
    description: 'Rol del usuario en el sistema ERP',
    default: Role.VENDEDOR,
  })
  @IsEnum(Role, {
    message: 'El rol debe ser uno de: ADMIN, FINANCE, INVENTORY_MANAGER, VENDEDOR',
  })
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({
    example: 'induwork',
    description: 'Código o ID de la empresa/tenant a la que pertenecerá el usuario',
  })
  @IsString()
  @IsOptional()
  tenantCode?: string;
}
