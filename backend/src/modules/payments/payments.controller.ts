import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Payments')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant',
})
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Listar pagos recibidos por la empresa' })
  @ApiResponse({ status: 200, description: 'Historial de pagos.' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.findAll(user.tenantId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Registrar un pago contra factura (Solo ADMIN y FINANCE)' })
  @ApiResponse({ status: 201, description: 'Pago registrado exitosamente.' })
  async create(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.create(createPaymentDto, user.tenantId);
  }
}
