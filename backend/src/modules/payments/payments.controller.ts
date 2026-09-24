import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import {
  InitiateWebpayDto,
  ConfirmWebpayDto,
  InitiateFlowDto,
} from './dto/payment-dtos';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Invoicing & Payments')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description:
    'Identificador del tenant',
})
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('webpay/initiate')
  @Roles(
    Role.ADMIN,
    Role.FINANCE,
    Role.VENDEDOR,
    Role.USER,
  )
  @ApiOperation({
    summary:
      'Iniciar pago con Transbank Webpay Plus',
  })
  @ApiResponse({
    status: 201,
    description:
      'Sesión de Webpay creada exitosamente.',
  })
  async initiateWebpay(
    @Body() dto: InitiateWebpayDto,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.paymentsService.createWebpayTransaction(
      dto,
      user.tenantId,
      user.id,
    );
  }

  @Public()
  @Post('webpay/confirm')
  @ApiOperation({
    summary:
      'Confirmar transacción de Transbank Webpay Plus',
  })
  @ApiResponse({
    status: 200,
    description:
      'Pago confirmado y orden actualizada.',
  })
  async confirmWebpay(
    @Body() dto: ConfirmWebpayDto,
    @CurrentTenant('id')
    tenantId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException(
        'El header de tenant es obligatorio para confirmar Webpay.',
      );
    }

    return this.paymentsService.confirmWebpayTransaction(
      dto,
      tenantId,
    );
  }

  @Post('flow/initiate')
  @Roles(
    Role.ADMIN,
    Role.FINANCE,
    Role.VENDEDOR,
  )
  @ApiOperation({
    summary:
      'Iniciar pago con Flow Chile',
  })
  async initiateFlow(
    @Body() dto: InitiateFlowDto,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.paymentsService.createFlowTransaction(
      dto,
      user.tenantId,
    );
  }

  @Post('mercadopago/initiate')
  @Roles(
    Role.ADMIN,
    Role.FINANCE,
    Role.VENDEDOR,
  )
  @ApiOperation({
    summary:
      'Iniciar pago con Mercado Pago Chile',
  })
  async initiateMercadoPago(
    @Body('orderId')
    orderId: string,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.paymentsService.createMercadoPagoPreference(
      orderId,
      user.tenantId,
    );
  }

  @Public()
  @Post('webhook/:gateway')
  @ApiParam({
    name: 'gateway',
    example: 'webpay',
    description:
      'Pasarela de pago',
  })
  @ApiOperation({
    summary:
      'Registrar recepción de webhook',
    })
  async handleWebhook(
    @Param('gateway')
    gateway: string,
    @Body()
    payload: Record<string, unknown>,
    @CurrentTenant('id')
    tenantId?: string,
  ) {
    return this.paymentsService.handleWebhook(
      gateway,
      payload,
      tenantId || '',
    );
  }

  @Get()
  @Roles(
    Role.ADMIN,
    Role.FINANCE,
  )
  @ApiOperation({
    summary:
      'Listar historial de pagos recibidos',
  })
  async findAll(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.paymentsService.findAll(
      user.tenantId,
    );
  }

  @Post()
  @Roles(
    Role.ADMIN,
    Role.FINANCE,
  )
  @ApiOperation({
    summary:
      'Registrar un pago manual',
  })
  async create(
    @Body()
    createPaymentDto: CreatePaymentDto,
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.paymentsService.create(
      createPaymentDto,
      user.tenantId,
    );
  }
}