import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { InvoicingService } from './invoicing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Invoicing')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant',
})
@Controller('invoicing')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Listar facturas de la empresa' })
  @ApiResponse({ status: 200, description: 'Listado de facturas emitidas.' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.invoicingService.findAll(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Obtener detalle de una factura' })
  @ApiResponse({ status: 200, description: 'Detalle de la factura.' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoicingService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Emitir una nueva factura (Solo ADMIN y FINANCE)' })
  @ApiResponse({ status: 201, description: 'Factura emitida exitosamente.' })
  async create(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoicingService.create(createInvoiceDto, user.tenantId);
  }
}
