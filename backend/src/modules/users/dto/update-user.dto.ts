import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { Role } from '../../../common/constants/roles.enum';

const ASSIGNABLE_ROLES = [
  Role.ADMIN,
  Role.FINANCE,
  Role.INVENTORY_MANAGER,
  Role.VENDEDOR,
  Role.USER,
] as const;

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Juan Carlos',
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Pérez Gómez',
  })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({
    enum: ASSIGNABLE_ROLES,
    example: Role.FINANCE,
    description:
      'Rol asignable desde la administración del tenant. SYSTEM_ADMIN está reservado para administración del sistema.',
  })
  @IsIn(ASSIGNABLE_ROLES, {
    message:
      'El rol debe ser ADMIN, FINANCE, INVENTORY_MANAGER, VENDEDOR o USER.',
  })
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}