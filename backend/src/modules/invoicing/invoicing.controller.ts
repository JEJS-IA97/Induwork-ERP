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
import { GenerateDteDto } from './dto/generate-dte.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Invoicing & Payments')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant (ej: coimsa, induwork, inversiones-mvi)',
})
@Controller('invoices')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Post('generate-dte')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Emitir Documento Tributario Electrónico (DTE Chile)',
    description:
      'Genera el XML para el SII con Timbre Electrónico TED (Tipo 33 Factura, Tipo 39 Boleta, Tipo 61 Nota de Crédito), genera el PDF oficial y lo sube automáticamente a Cloudflare R2.',
  })
  @ApiResponse({ status: 201, description: 'DTE y PDF emitidos exitosamente.' })
  async generateDte(
    @Body() dto: GenerateDteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoicingService.generateDte(dto, user.tenantId, user.id);
  }

  @Get(':id/pdf')
  @Roles(Role.ADMIN, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Obtener URL del PDF oficial del documento tributario' })
  @ApiResponse({ status: 200, description: 'URL de descarga del PDF en Cloudflare R2.' })
  async getInvoicePdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoicingService.getInvoicePdf(id, user.tenantId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Listar facturas y documentos emitidos' })
  @ApiResponse({ status: 200, description: 'Listado de facturas de la empresa.' })
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
  @ApiOperation({ summary: 'Crear borrador de factura (Solo ADMIN y FINANCE)' })
  @ApiResponse({ status: 201, description: 'Factura creada exitosamente.' })
  async create(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoicingService.create(createInvoiceDto, user.tenantId);
  }
}
