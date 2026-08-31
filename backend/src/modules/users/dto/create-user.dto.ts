import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/constants/roles.enum';

export class CreateUserDto {
  @ApiProperty({
    example: 'juan.perez@Coimsa.cl',
    description: 'Correo electrónico del usuario',
  })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email: string;

  @ApiProperty({
    example: 'ClaveSegura2026!',
    description: 'Contraseña del usuario',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @ApiProperty({ example: 'Juan', description: 'Nombre del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  firstName: string;

  @ApiProperty({ example: 'Pérez', description: 'Apellido del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El apellido es requerido' })
  lastName: string;

  @ApiProperty({
    enum: Role,
    example: Role.INVENTORY_MANAGER,
    description: 'Rol del usuario en el ERP',
  })
  @IsEnum(Role)
  @IsNotEmpty({ message: 'El rol es requerido' })
  role: Role;

  @ApiProperty({
    example: 'Coimsa',
    description: 'ID o código de la empresa a la que pertenecerá el usuario',
  })
  @IsString()
  @IsNotEmpty({ message: 'La empresa/tenant es requerida' })
  tenantCode: string;
}
