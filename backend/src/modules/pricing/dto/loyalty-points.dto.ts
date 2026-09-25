import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsUUID,
} from 'class-validator';

export class EarnPointsDto {
  @ApiProperty({
    example: 'uuid-order-id',
    description:
      'ID de una orden existente. El monto y el cliente se obtienen directamente desde la orden.',
  })
  @IsUUID('4')
  @IsNotEmpty()
  orderId: string;
}

export class RedeemPointsDto {
  @ApiProperty({
    example: 'uuid-order-id',
    description:
      'ID de la orden sobre la que se aplica el canje. El cliente se obtiene desde la orden.',
  })
  @IsUUID('4')
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({
    example: 200,
    description: 'Cantidad de puntos a canjear.',
  })
  @IsInt()
  @IsPositive()
  pointsToRedeem: number;
}