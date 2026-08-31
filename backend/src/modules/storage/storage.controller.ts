import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { GeneratePresignedUrlDto } from './dto/generate-presigned-url.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Storage')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant',
})
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presigned-upload-url')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({
    summary: 'Generar Presigned URL de subida directa a Cloudflare R2 / S3',
    description:
      'Genera una URL firmada temporal (15 min) para subir archivos directamente desde el cliente al bucket. Valida límites: Máximo 12MB para imágenes y 5MB para documentos PDF.',
  })
  @ApiResponse({
    status: 201,
    description: 'URL prefirmada generada con sus encabezados requeridos.',
  })
  @ApiResponse({
    status: 400,
    description: 'Tipo de archivo no permitido o tamaño excede los límites (12MB imágenes / 5MB PDFs).',
  })
  async generatePresignedUploadUrl(
    @Body() dto: GeneratePresignedUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storageService.generatePresignedUploadUrl(
      dto,
      user.tenantId,
      user.id,
    );
  }

  @Post('confirm-upload')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER, Role.FINANCE, Role.VENDEDOR)
  @ApiOperation({
    summary: 'Confirmar subida y asociar archivo a productos o documentos',
    description:
      'Registra el archivo subido en la base de datos, lo asocia al producto (imagen de carrusel, imagen principal o ficha técnica PDF) y genera un registro de auditoría.',
  })
  @ApiResponse({ status: 201, description: 'Archivo registrado y vinculado.' })
  async confirmUpload(
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storageService.confirmUpload(dto, user.tenantId, user.id);
  }

  @Get('presigned-download-url')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER, Role.VENDEDOR)
  @ApiOperation({
    summary: 'Obtener URL temporal de descarga para archivos privados',
  })
  @ApiQuery({ name: 'fileKey', description: 'Ruta o Key del archivo en S3/R2' })
  @ApiResponse({ status: 200, description: 'URL firmada de lectura/descarga.' })
  async generatePresignedDownloadUrl(
    @Query('fileKey') fileKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storageService.generatePresignedDownloadUrl(
      fileKey,
      user.tenantId,
    );
  }

  @Get('files')
  @Roles(Role.ADMIN, Role.FINANCE, Role.INVENTORY_MANAGER, Role.VENDEDOR)
  @ApiOperation({ summary: 'Listar archivos almacenados de la empresa' })
  @ApiResponse({ status: 200, description: 'Listado de archivos registrados.' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.storageService.findAll(user.tenantId);
  }

  @Delete('files/:id')
  @Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
  @ApiOperation({
    summary: 'Eliminar archivo del almacenamiento y base de datos (ADMIN/INVENTORY_MANAGER)',
  })
  @ApiResponse({ status: 200, description: 'Archivo eliminado con éxito.' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storageService.delete(id, user.tenantId, user.id);
  }
}
