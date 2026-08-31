import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({ example: 'uuid-user-id', description: 'ID del usuario destinatario' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: 'Nueva orden generada', description: 'Título de la notificación' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'La orden ORD-123456 ha sido creada y está pendiente de facturación.', description: 'Cuerpo del mensaje' })
  @IsString()
  @IsNotEmpty()
  message: string;
}
