import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
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
import { InitiateWebpayDto, ConfirmWebpayDto, InitiateFlowDto } from './dto/payment-dtos';
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
  description: 'Identificador del tenant (ej: coimsa, induwork, inversiones-mvi)',
})
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webpay/initiate')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR, Role.USER)
  @ApiOperation({
    summary: 'Iniciar pago con Transbank Webpay Plus',
    description:
      'Crea una sesión de pago en Transbank y retorna el token y la URL de redirección.',
  })
  @ApiResponse({ status: 201, description: 'Sesión de Webpay creada exitosamente.' })
  async initiateWebpay(
    @Body() dto: InitiateWebpayDto,
    @CurrentUser() user: AuthenticatedUser,
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
    summary: 'Confirmar transacción de Transbank Webpay Plus',
    description:
      'Valida el token devuelto por Transbank, aprueba el pago, actualiza la orden y genera la factura.',
  })
  @ApiResponse({ status: 200, description: 'Pago confirmado y orden actualizada.' })
  async confirmWebpay(
    @Body() dto: ConfirmWebpayDto,
    @CurrentTenant('id') tenantId?: string,
  ) {
    return this.paymentsService.confirmWebpayTransaction(
      dto,
      tenantId || 'coimsa',
    );
  }

  @Post('flow/initiate')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Iniciar pago con Flow Chile' })
  async initiateFlow(
    @Body() dto: InitiateFlowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.createFlowTransaction(dto, user.tenantId);
  }

  @Post('mercadopago/initiate')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Iniciar pago con Mercado Pago Chile' })
  async initiateMercadoPago(
    @Body('orderId') orderId: string,
    @Body('amount') amount: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.createMercadoPagoPreference(orderId, amount, user.tenantId);
  }

  @Public()
  @Post('webhook/:gateway')
  @ApiParam({ name: 'gateway', example: 'webpay', description: 'Pasarela de pago (webpay, flow, mercadopago)' })
  @ApiOperation({ summary: 'Webhook multipasarela para actualización asíncrona de pagos' })
  async handleWebhook(
    @Param('gateway') gateway: string,
    @Body() payload: any,
    @Headers() headers: any,
    @CurrentTenant('id') tenantId?: string,
  ) {
    return this.paymentsService.handleWebhook(gateway, payload, headers, tenantId || 'coimsa');
  }

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Listar historial de pagos recibidos' })
  @ApiResponse({ status: 200, description: 'Historial de pagos.' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.findAll(user.tenantId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Registrar un pago manual (Transferencia / Efectivo)' })
  @ApiResponse({ status: 201, description: 'Pago registrado exitosamente.' })
  async create(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.create(createPaymentDto, user.tenantId);
  }
}
