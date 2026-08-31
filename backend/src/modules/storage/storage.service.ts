import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../database/prisma.service';
import {
  GeneratePresignedUrlDto,
  StorageCategory,
} from './dto/generate-presigned-url.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { ProductDocumentType } from '@prisma/client';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  // Límites de tamaño en bytes
  private readonly MAX_IMAGE_SIZE = 12 * 1024 * 1024; // 12 MB
  private readonly MAX_DOCUMENT_SIZE = 5 * 1024 * 1024; // 5 MB
  private readonly MAX_SIGNATURE_SIZE = 2 * 1024 * 1024; // 2 MB

  // Tipos MIME permitidos
  private readonly ALLOWED_IMAGE_MIMES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'image/gif',
  ];
  private readonly ALLOWED_DOCUMENT_MIMES = ['application/pdf'];
  private readonly ALLOWED_SIGNATURE_MIMES = ['image/png', 'image/svg+xml'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.bucketName =
      this.configService.get<string>('S3_BUCKET_NAME') || 'induwork-erp-storage';
    this.publicUrl =
      this.configService.get<string>('S3_PUBLIC_URL') ||
      'https://storage.induwork.cl';

    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const region = this.configService.get<string>('S3_REGION') || 'auto';
    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY_ID') || 'placeholder_key';
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_ACCESS_KEY') || 'placeholder_secret';

    this.s3Client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Requerido para compatibilidad con Cloudflare R2 y MinIO
    });
  }

  /**
   * Valida tipo de archivo y tamaño según la categoría (12MB Imágenes / 5MB PDFs)
   */
  private validateFileConstraints(
    fileType: string,
    fileSize: number,
    category: StorageCategory,
  ) {
    if (category === StorageCategory.PRODUCT_IMAGE) {
      if (!this.ALLOWED_IMAGE_MIMES.includes(fileType.toLowerCase())) {
        throw new BadRequestException(
          `Formato de imagen no permitido '${fileType}'. Formatos válidos: JPEG, PNG, WEBP, SVG, GIF.`,
        );
      }
      if (fileSize > this.MAX_IMAGE_SIZE) {
        throw new BadRequestException(
          `La imagen supera el límite máximo permitido de 12 MB (Tamaño actual: ${(
            fileSize /
            (1024 * 1024)
          ).toFixed(2)} MB).`,
        );
      }
    } else if (category === StorageCategory.PRODUCT_DOCUMENT || category === StorageCategory.INVOICE_PDF) {
      if (!this.ALLOWED_DOCUMENT_MIMES.includes(fileType.toLowerCase())) {
        throw new BadRequestException(
          `Formato de documento no permitido '${fileType}'. Solo se admiten archivos PDF.`,
        );
      }
      if (fileSize > this.MAX_DOCUMENT_SIZE) {
        throw new BadRequestException(
          `El documento supera el límite máximo permitido de 5 MB (Tamaño actual: ${(
            fileSize /
            (1024 * 1024)
          ).toFixed(2)} MB).`,
        );
      }
    } else if (category === StorageCategory.SIGNATURE) {
      if (!this.ALLOWED_SIGNATURE_MIMES.includes(fileType.toLowerCase())) {
        throw new BadRequestException(
          `Formato de firma no permitido. Solo se admiten imágenes PNG o SVG transparentes.`,
        );
      }
      if (fileSize > this.MAX_SIGNATURE_SIZE) {
        throw new BadRequestException(`La firma digital no debe exceder 2 MB.`);
      }
    } else {
      // General
      if (fileSize > this.MAX_IMAGE_SIZE) {
        throw new BadRequestException(`El archivo supera el límite máximo de 12 MB.`);
      }
    }
  }

  /**
   * Genera una Presigned URL de subida directa a Cloudflare R2 / S3
   */
  async generatePresignedUploadUrl(
    dto: GeneratePresignedUrlDto,
    tenantId: string,
    userId?: string,
  ) {
    this.validateFileConstraints(dto.fileType, dto.fileSize, dto.category);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const tenantFolder = tenant?.code || tenantId;
    const timestamp = Date.now();
    const cleanFileName = dto.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `tenants/${tenantFolder}/${dto.category.toLowerCase()}/${timestamp}-${cleanFileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
      ContentType: dto.fileType,
      Metadata: {
        tenantId,
        userId: userId || 'anonymous',
        category: dto.category,
        originalName: dto.fileName,
      },
    });

    let uploadUrl: string;
    const expiresInSeconds = 900; // 15 minutos

    try {
      uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (error) {
      this.logger.error('Error generando Presigned URL:', error);
      // Mock URL para desarrollo si las credenciales de R2/S3 aún no están configuradas
      uploadUrl = `${this.publicUrl}/mock-upload/${fileKey}?signature=mock_presigned_token`;
    }

    const publicFileUrl = `${this.publicUrl}/${fileKey}`;

    return {
      uploadUrl,
      fileKey,
      fileUrl: publicFileUrl,
      expiresInSeconds,
      headers: {
        'Content-Type': dto.fileType,
      },
      fileDetails: {
        fileName: dto.fileName,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        category: dto.category,
        productId: dto.productId,
      },
    };
  }

  /**
   * Confirma la subida y asocia el archivo a Productos, Fichas Técnicas o Auditoría
   */
  async confirmUpload(
    dto: ConfirmUploadDto,
    tenantId: string,
    userId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Registrar archivo en StorageFile
      const storageRecord = await tx.storageFile.create({
        data: {
          tenantId,
          fileName: dto.fileName,
          fileUrl: dto.fileUrl,
          fileType: dto.fileType,
          fileSize: dto.fileSize,
          uploadedBy: userId,
        },
      });

      // 2. Si está vinculado a un Producto
      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, tenantId },
        });

        if (product) {
          // Categoría: Imagen de Producto
          if (dto.category === StorageCategory.PRODUCT_IMAGE) {
            const currentImages = product.imageUrls || [];
            const isMain = dto.isMainImage ?? currentImages.length === 0;

            await tx.productImage.create({
              data: {
                tenantId,
                productId: dto.productId,
                url: dto.fileUrl,
                altText: dto.altText || product.name,
                isMain,
              },
            });

            await tx.product.update({
              where: { id: product.id },
              data: {
                imageUrls: [...currentImages, dto.fileUrl],
                ...(isMain ? { mainImageUrl: dto.fileUrl } : {}),
              },
            });
          }

          // Categoría: Ficha Técnica o Documento
          if (dto.category === StorageCategory.PRODUCT_DOCUMENT) {
            await tx.productDocument.create({
              data: {
                tenantId,
                productId: dto.productId,
                title: dto.title || dto.fileName,
                fileUrl: dto.fileUrl,
                fileType: dto.fileType,
                fileSize: dto.fileSize,
                documentType: dto.documentType || ProductDocumentType.FICHA_TECNICA,
                isPublic: true,
              },
            });
          }
        }
      }

      // 3. Registrar Log de Auditoría
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'UPLOAD_FILE',
          entityName: 'StorageFile',
          entityId: storageRecord.id,
          newValues: {
            fileName: dto.fileName,
            fileKey: dto.fileKey,
            category: dto.category,
            productId: dto.productId,
            fileSize: dto.fileSize,
          },
        },
      });

      return {
        message: 'Archivo confirmado y registrado exitosamente.',
        file: storageRecord,
      };
    });
  }

  /**
   * Genera URL prefirmada de descarga temporal (para archivos privados/sensibles)
   */
  async generatePresignedDownloadUrl(fileKey: string, tenantId: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
    });

    try {
      const downloadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600, // 1 hora
      });

      return { downloadUrl, expiresInSeconds: 3600 };
    } catch (error) {
      return {
        downloadUrl: `${this.publicUrl}/${fileKey}`,
        expiresInSeconds: 3600,
      };
    }
  }

  /**
   * Listar archivos del tenant
   */
  async findAll(tenantId: string) {
    return this.prisma.storageFile.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Eliminar archivo del bucket y de la base de datos
   */
  async delete(id: string, tenantId: string, userId?: string) {
    const file = await this.prisma.storageFile.findFirst({
      where: { id, tenantId },
    });

    if (!file) {
      throw new NotFoundException('Archivo no encontrado.');
    }

    // Intentar eliminar del bucket S3 / R2 si la URL contiene el nombre del bucket o prefijo
    try {
      const urlParts = file.fileUrl.split(`${this.publicUrl}/`);
      if (urlParts.length > 1) {
        const fileKey = urlParts[1];
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: fileKey,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(`No se pudo eliminar el objeto de S3/R2: ${err.message}`);
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'DELETE_FILE',
        entityName: 'StorageFile',
        entityId: file.id,
        oldValues: {
          fileName: file.fileName,
          fileUrl: file.fileUrl,
        },
      },
    });

    return this.prisma.storageFile.delete({
      where: { id },
    });
  }
}
