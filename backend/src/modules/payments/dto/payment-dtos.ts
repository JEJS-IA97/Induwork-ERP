import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
} from 'class-validator';

export class InitiateWebpayDto {
  @ApiProperty({
    example: 'uuid-order-id',
    description: 'ID de la orden a pagar',
  })
  @IsString()
  @IsNotEmpty({
    message: 'El orderId es requerido',
  })
  orderId: string;
}

export class ConfirmWebpayDto {
  @ApiProperty({
    example:
      '01ab8732b23456789abcdef0123456789abcdef0123456789abcdef01234567',
    description:
      'Token de transacción recibido desde Transbank Webpay Plus',
  })
  @IsString()
  @IsNotEmpty({
    message: 'El token de Webpay es requerido',
  })
  token: string;
}

export class InitiateFlowDto {
  @ApiProperty({
    example: 'uuid-order-id',
    description: 'ID de la orden',
  })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({
    example: 'cliente@coimsa.cl',
    description: 'Email del pagador',
  })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example:
      'https://app.coimsa.cl/checkout/return',
    description:
      'URL de retorno del flujo de pago',
  })
  @IsUrl()
  @IsNotEmpty()
  returnUrl: string;
}