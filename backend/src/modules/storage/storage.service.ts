import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
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
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;
  private readonly isProduction: boolean;
  private readonly storageMockMode: boolean;

  // Límites de tamaño en bytes
  private readonly MAX_IMAGE_SIZE = 12 * 1024 * 1024;
  private readonly MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;
  private readonly MAX_SIGNATURE_SIZE = 2 * 1024 * 1024;

  // Tipos MIME permitidos
  private readonly ALLOWED_IMAGE_MIMES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'image/gif',
  ];

  private readonly ALLOWED_DOCUMENT_MIMES = [
    'application/pdf',
  ];

  private readonly ALLOWED_SIGNATURE_MIMES = [
    'image/png',
    'image/svg+xml',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.isProduction =
      this.configService.get<string>('NODE_ENV') ===
      'production';

    this.storageMockMode =
      this.configService
        .get<string>('STORAGE_MOCK_MODE')
        ?.trim()
        .toLowerCase() === 'true' &&
      !this.isProduction;

    this.bucketName =
      this.configService
        .get<string>('S3_BUCKET_NAME')
        ?.trim() || '';

    const configuredPublicUrl =
      this.configService
        .get<string>('S3_PUBLIC_URL')
        ?.trim() || '';

    this.publicUrl = (
      configuredPublicUrl ||
      (this.storageMockMode
        ? 'http://localhost:4000/mock-storage'
        : '')
    ).replace(/\/+$/, '');

    const endpoint =
      this.configService
        .get<string>('S3_ENDPOINT')
        ?.trim() || '';

    const region =
      this.configService
        .get<string>('S3_REGION')
        ?.trim() || 'auto';

    const accessKeyId =
      this.configService
        .get<string>('S3_ACCESS_KEY_ID')
        ?.trim() || '';

    const secretAccessKey =
      this.configService
        .get<string>('S3_SECRET_ACCESS_KEY')
        ?.trim() || '';

    if (!this.publicUrl) {
      throw new Error(
        'S3_PUBLIC_URL es obligatorio para el módulo de almacenamiento.',
      );
    }

    if (
      !this.storageMockMode &&
      (!this.bucketName || !endpoint)
    ) {
      throw new Error(
        'La configuración de almacenamiento S3/R2 está incompleta. Configure S3_BUCKET_NAME y S3_ENDPOINT o habilite STORAGE_MOCK_MODE únicamente en desarrollo.',
      );
    }

    if (
      this.isProduction &&
      (!accessKeyId || !secretAccessKey)
    ) {
      throw new Error(
        'S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY son obligatorios para almacenamiento S3/R2 en producción.',
      );
    }

    this.s3Client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      ...(accessKeyId && secretAccessKey
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
          }
        : {}),
      forcePathStyle: true,
    });
  }

  private validateFileConstraints(
    fileType: string,
    fileSize: number,
    category: StorageCategory,
  ) {
    const normalizedType = fileType
      .trim()
      .toLowerCase();

    if (category === StorageCategory.PRODUCT_IMAGE) {
      if (!this.ALLOWED_IMAGE_MIMES.includes(normalizedType)) {
        throw new BadRequestException(
          `Formato de imagen no permitido '${fileType}'. Formatos válidos: JPEG, PNG, WEBP, SVG, GIF.`,
        );
      }

      if (fileSize > this.MAX_IMAGE_SIZE) {
        throw new BadRequestException(
          'La imagen supera el límite máximo permitido de 12 MB.',
        );
      }
      return;
    }

    if (
      category === StorageCategory.PRODUCT_DOCUMENT ||
      category === StorageCategory.INVOICE_PDF
    ) {
      if (!this.ALLOWED_DOCUMENT_MIMES.includes(normalizedType)) {
        throw new BadRequestException(
          `Formato de documento no permitido '${fileType}'. Solo se admiten archivos PDF.`,
        );
      }

      if (fileSize > this.MAX_DOCUMENT_SIZE) {
        throw new BadRequestException(
          'El documento supera el límite máximo permitido de 5 MB.',
        );
      }
      return;
    }

    if (category === StorageCategory.SIGNATURE) {
      if (!this.ALLOWED_SIGNATURE_MIMES.includes(normalizedType)) {
        throw new BadRequestException(
          'Formato de firma no permitido. Solo se admiten PNG o SVG.',
        );
      }

      if (fileSize > this.MAX_SIGNATURE_SIZE) {
        throw new BadRequestException(
          'La firma digital no debe exceder 2 MB.',
        );
      }
      return;
    }

    if (fileSize > this.MAX_IMAGE_SIZE) {
      throw new BadRequestException(
        'El archivo supera el límite máximo de 12 MB.',
      );
    }
  }

  private buildPublicFileUrl(fileKey: string): string {
    return `${this.publicUrl}/${fileKey}`;
  }

  private validateFileKeyForTenant(
    fileKey: string,
    tenantCode: string,
  ) {
    if (
      !fileKey ||
      fileKey.includes('..') ||
      fileKey.includes('\\') ||
      /[\u0000-\u001F\u007F]/.test(fileKey)
    ) {
      throw new BadRequestException(
        'El fileKey no es válido.',
      );
    }

    const expectedPrefix = `tenants/${tenantCode}/`;

    if (!fileKey.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        'El archivo no pertenece al tenant autenticado.',
      );
    }
  }

  private async verifyUploadedObject(
    fileKey: string,
    expectedFileType: string,
    expectedFileSize: number,
  ) {
    try {
      const object = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
        }),
      );

      const actualFileSize = object.ContentLength;
      const actualFileType =
        object.ContentType
          ?.split(';')[0]
          ?.trim()
          .toLowerCase();

      if (
        actualFileSize === undefined ||
        actualFileSize !== expectedFileSize
      ) {
        throw new BadRequestException(
          'El tamaño del archivo almacenado no coincide con el tamaño declarado.',
        );
      }

      if (
        !actualFileType ||
        actualFileType !==
          expectedFileType.trim().toLowerCase()
      ) {
        throw new BadRequestException(
          'El tipo MIME del archivo almacenado no coincide con el tipo declarado.',
        );
      }
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      const awsError = error as {
        name?: string;
        $metadata?: {
          httpStatusCode?: number;
        };
      };

      if (
        awsError.name === 'NotFound' ||
        awsError.name === 'NoSuchKey' ||
        awsError.$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundException(
          'El archivo no existe en el almacenamiento.',
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido';
      const stack =
        error instanceof Error
          ? error.stack
          : undefined;

      this.logger.error(
        `Error verificando objeto ${fileKey}: ${message}`,
        stack,
      );

      throw new ServiceUnavailableException(
        'No fue posible verificar el archivo en el almacenamiento.',
      );
    }
  }

  async generatePresignedUploadUrl(
    dto: GeneratePresignedUrlDto,
    tenantId: string,
    userId?: string,
  ) {
    this.validateFileConstraints(
      dto.fileType,
      dto.fileSize,
      dto.category,
    );

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        isActive: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa/tenant no encontrada o inactiva.',
      );
    }

    const cleanFileName = dto.fileName.replace(
      /[^a-zA-Z0-9.-]/g,
      '_',
    );

    const timestamp = Date.now();

    const fileKey =
      `tenants/${tenant.code}/` +
      `${dto.category.toLowerCase()}/` +
      `${timestamp}-${cleanFileName}`;

    const expiresInSeconds = 900;
    let uploadUrl: string;

    if (this.storageMockMode) {
      uploadUrl =
        `${this.publicUrl}/mock-upload/${fileKey}` +
        '?signature=mock_presigned_token';
    } else {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        ContentType: dto.fileType,
      });

      try {
        uploadUrl = await getSignedUrl(
          this.s3Client,
          command,
          {
            expiresIn: expiresInSeconds,
          },
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error desconocido';
        const stack =
          error instanceof Error
            ? error.stack
            : undefined;

        this.logger.error(
          `Error generando Presigned URL: ${message}`,
          stack,
        );

        throw new ServiceUnavailableException(
          'El almacenamiento de archivos no está disponible.',
        );
      }
    }

    const publicFileUrl =
      this.buildPublicFileUrl(fileKey);

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

  async confirmUpload(
    dto: ConfirmUploadDto,
    tenantId: string,
    userId?: string,
  ) {
    this.validateFileConstraints(
      dto.fileType,
      dto.fileSize,
      dto.category,
    );

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        isActive: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa/tenant no encontrada o inactiva.',
      );
    }

    this.validateFileKeyForTenant(
      dto.fileKey,
      tenant.code,
    );

    const expectedFileUrl =
      this.buildPublicFileUrl(dto.fileKey);

    if (dto.fileUrl !== expectedFileUrl) {
      throw new BadRequestException(
        'La fileUrl no corresponde al fileKey proporcionado.',
      );
    }

    if (!this.storageMockMode) {
      await this.verifyUploadedObject(
        dto.fileKey,
        dto.fileType,
        dto.fileSize,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existingFile =
        await tx.storageFile.findFirst({
          where: {
            tenantId,
            fileUrl: dto.fileUrl,
          },
        });

      if (existingFile) {
        throw new ConflictException(
          'El archivo ya fue confirmado anteriormente.',
        );
      }

      let product = null;

      if (dto.productId) {
        product = await tx.product.findFirst({
          where: {
            id: dto.productId,
            tenantId,
            isActive: true,
            isArchived: false,
          },
        });

        if (!product) {
          throw new NotFoundException(
            'El producto no existe dentro del tenant autenticado.',
          );
        }
      }

      const storageRecord =
        await tx.storageFile.create({
          data: {
            tenantId,
            fileName: dto.fileName,
            fileUrl: dto.fileUrl,
            fileType: dto.fileType,
            fileSize: dto.fileSize,
            uploadedBy: userId,
          },
        });

      if (product) {
        if (
          dto.category ===
          StorageCategory.PRODUCT_IMAGE
        ) {
          const currentImages =
            product.imageUrls || [];

          const isMain =
            dto.isMainImage ??
            currentImages.length === 0;

          await tx.productImage.create({
            data: {
              tenantId,
              productId: product.id,
              url: dto.fileUrl,
              altText:
                dto.altText || product.name,
              isMain,
            },
          });

          await tx.product.update({
            where: { id: product.id },
            data: {
              imageUrls: [
                ...currentImages,
                dto.fileUrl,
              ],
              ...(isMain
                ? {
                    mainImageUrl: dto.fileUrl,
                  }
                : {}),
            },
          });
        }

        if (
          dto.category ===
          StorageCategory.PRODUCT_DOCUMENT
        ) {
          await tx.productDocument.create({
            data: {
              tenantId,
              productId: product.id,
              title:
                dto.title || dto.fileName,
              fileUrl: dto.fileUrl,
              fileType: dto.fileType,
              fileSize: dto.fileSize,
              documentType:
                dto.documentType ||
                ProductDocumentType.FICHA_TECNICA,
              isPublic: false,
            },
          });
        }
      }

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
        message:
          'Archivo confirmado y registrado exitosamente.',
        file: storageRecord,
      };
    });
  }

  async generatePresignedDownloadUrl(
    fileKey: string,
    tenantId: string,
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        isActive: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa/tenant no encontrada o inactiva.',
      );
    }

    this.validateFileKeyForTenant(
      fileKey,
      tenant.code,
    );

    const fileUrl =
      this.buildPublicFileUrl(fileKey);

    const file =
      await this.prisma.storageFile.findFirst({
        where: {
          tenantId,
          fileUrl,
        },
      });

    if (!file) {
      throw new NotFoundException(
        'Archivo no encontrado dentro del tenant autenticado.',
      );
    }

    if (this.storageMockMode) {
      return {
        downloadUrl:
          `${this.publicUrl}/mock-download/${fileKey}` +
          '?signature=mock_download_token',
        expiresInSeconds: 3600,
      };
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
    });

    try {
      const downloadUrl =
        await getSignedUrl(
          this.s3Client,
          command,
          {
            expiresIn: 3600,
          },
        );

      return {
        downloadUrl,
        expiresInSeconds: 3600,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido';
      const stack =
        error instanceof Error
          ? error.stack
          : undefined;

      this.logger.error(
        `Error generando descarga para ${file.id}: ${message}`,
        stack,
      );

      throw new ServiceUnavailableException(
        'No fue posible generar la URL segura de descarga.',
      );
    }
  }

  async findAll(tenantId: string) {
    return this.prisma.storageFile.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(
    id: string,
    tenantId: string,
    userId?: string,
  ) {
    const file =
      await this.prisma.storageFile.findFirst({
        where: {
          id,
          tenantId,
        },
      });

    if (!file) {
      throw new NotFoundException(
        'Archivo no encontrado.',
      );
    }

    if (!this.storageMockMode) {
      try {
        const tenant =
          await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { code: true },
          });

        if (
          tenant &&
          file.fileUrl.startsWith(
            `${this.publicUrl}/`,
          )
        ) {
          const fileKey =
            file.fileUrl.substring(
              `${this.publicUrl}/`.length,
            );

          this.validateFileKeyForTenant(
            fileKey,
            tenant.code,
          );

          await this.s3Client.send(
            new DeleteObjectCommand({
              Bucket: this.bucketName,
              Key: fileKey,
            }),
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error desconocido';

        this.logger.warn(
          `No se pudo eliminar el objeto de S3/R2: ${message}`,
        );
      }
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
      where: { id: file.id },
    });
  }
}
