import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUrl } from 'class-validator';

export class InitiateWebpayDto {
  @ApiProperty({ example: 'uuid-order-id', description: 'ID de la orden a pagar' })
  @IsString()
  @IsNotEmpty({ message: 'El orderId es requerido' })
  orderId: string;

  @ApiProperty({ example: 450000, description: 'Monto total en pesos chilenos (CLP)' })
  @IsNumber()
  @IsPositive({ message: 'El monto debe ser mayor a cero' })
  amount: number;

  @ApiProperty({
    example: 'https://app.induwork.cl/checkout/webpay/return',
    description: 'URL de retorno en el frontend tras completar el pago en Transbank',
  })
  @IsUrl({}, { message: 'La URL de retorno debe ser válida' })
  @IsNotEmpty()
  returnUrl: string;
}

export class ConfirmWebpayDto {
  @ApiProperty({
    example: '01ab8732b23456789abcdef0123456789abcdef0123456789abcdef01234567',
    description: 'Token de transacción recibido desde Transbank Webpay Plus',
  })
  @IsString()
  @IsNotEmpty({ message: 'El token de Webpay es requerido' })
  token: string;
}

export class InitiateFlowDto {
  @ApiProperty({ example: 'uuid-order-id', description: 'ID de la orden' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ example: 450000, description: 'Monto a pagar' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'cliente@coimsa.cl', description: 'Email del pagador' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'https://app.coimsa.cl/checkout/return', description: 'URL de retorno' })
  @IsUrl()
  returnUrl: string;
}
