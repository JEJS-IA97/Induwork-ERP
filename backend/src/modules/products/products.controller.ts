import {
  Controller,
  Get,
  Post,
  Delete,
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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Products')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant',
})
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER, Role.VENDEDOR)
  @ApiOperation({ summary: 'Listar productos del catálogo de la empresa' })
  @ApiResponse({ status: 200, description: 'Catálogo de productos.' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.productsService.findAll(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER, Role.VENDEDOR)
  @ApiOperation({ summary: 'Obtener detalle de un producto' })
  @ApiResponse({ status: 200, description: 'Detalle del producto.' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Crear un nuevo producto en el catálogo' })
  @ApiResponse({ status: 201, description: 'Producto creado.' })
  async create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.create(createProductDto, user.tenantId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({ summary: 'Desactivar producto del catálogo' })
  @ApiResponse({ status: 200, description: 'Producto desactivado.' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.remove(id, user.tenantId);
  }
}
