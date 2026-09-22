import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export class EarnPointsDto {
  @ApiProperty({ example: 'uuid-customer-id', description: 'ID del cliente' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 450000.0, description: 'Monto de la compra para cálculo de puntos' })
  @IsPositive()
  purchaseAmount: number;

  @ApiPropertyOptional({ example: 'uuid-order-id', description: 'ID de la orden' })
  @IsString()
  @IsOptional()
  orderId?: string;
}

export class RedeemPointsDto {
  @ApiProperty({ example: 'uuid-customer-id', description: 'ID del cliente' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 200, description: 'Cantidad de puntos a canjear' })
  @IsInt()
  @IsPositive()
  pointsToRedeem: number;

  @ApiPropertyOptional({ example: 'uuid-order-id', description: 'ID de la orden donde se aplica el descuento' })
  @IsString()
  @IsOptional()
  orderId?: string;
}
