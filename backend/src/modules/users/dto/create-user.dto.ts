import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/constants/roles.enum';

const ASSIGNABLE_ROLES = [
  Role.ADMIN,
  Role.FINANCE,
  Role.INVENTORY_MANAGER,
  Role.VENDEDOR,
  Role.USER,
] as const;

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
    enum: ASSIGNABLE_ROLES,
    example: Role.VENDEDOR,
    description:
      'Rol asignable desde la administración del tenant. SYSTEM_ADMIN no puede asignarse desde este endpoint.',
  })
  @IsIn(ASSIGNABLE_ROLES, {
    message:
      'El rol debe ser ADMIN, FINANCE, INVENTORY_MANAGER, VENDEDOR o USER.',
  })
  @IsNotEmpty({ message: 'El rol es requerido' })
  role: Role;

  @ApiProperty({
    example: 'Coimsa',
    description:
      'ID o código de la empresa a la que pertenecerá el usuario',
  })
  @IsString()
  @IsNotEmpty({ message: 'La empresa/tenant es requerida' })
  tenantCode: string;
}