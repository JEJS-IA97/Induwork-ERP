import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
  Headers,
  Query,
  HttpCode,
  HttpStatus,
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
  description: 'Identificador del tenant',
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
  @Post('webhook/flow/:tenantCode')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'tenantCode',
    example: 'coimsa',
    description:
      'Código del tenant configurado para recibir el callback de Flow',
  })
  @ApiOperation({
    summary:
      'Recibir callback de Flow y verificar el estado directamente con Flow',
  })
  @ApiResponse({
    status: 200,
    description:
      'Callback autenticado y registrado.',
  })
  async handleFlowWebhook(
    @Param('tenantCode')
    tenantCode: string,
    @Body()
    payload: Record<string, unknown>,
  ) {
    const token =
      typeof payload.token === 'string'
        ? payload.token
        : '';

    return this.paymentsService.handleFlowWebhook(
      tenantCode,
      token,
    );
  }

  @Public()
  @Post('webhook/mercadopago/:tenantCode')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'tenantCode',
    example: 'coimsa',
    description:
      'Código del tenant configurado para recibir webhooks de Mercado Pago',
  })
  @ApiOperation({
    summary:
      'Validar y registrar webhook firmado de Mercado Pago',
  })
  @ApiResponse({
    status: 200,
    description:
      'Webhook autenticado y registrado.',
  })
  async handleMercadoPagoWebhook(
    @Param('tenantCode')
    tenantCode: string,
    @Headers('x-signature')
    xSignature?: string,
    @Headers('x-request-id')
    xRequestId?: string,
    @Query('data.id')
    dataId?: string,
    @Body()
    payload?: Record<string, unknown>,
  ) {
    const bodyDataId =
      payload &&
      typeof payload.data === 'object' &&
      payload.data !== null &&
      typeof (payload.data as Record<string, unknown>).id ===
        'string'
        ? ((payload.data as Record<string, unknown>).id as string)
        : undefined;

    return this.paymentsService.handleMercadoPagoWebhook(
      tenantCode,
      xSignature || '',
      xRequestId || '',
      dataId || bodyDataId || '',
      payload || {},
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
