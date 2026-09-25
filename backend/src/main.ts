import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import {
  SwaggerModule,
  DocumentBuilder,
} from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger =
    new Logger('Bootstrap');

  const app =
    await NestFactory.create(
      AppModule,
    );

  const isProduction =
    process.env.NODE_ENV ===
    'production';

  const swaggerEnabled =
    process.env.SWAGGER_ENABLED ===
    'true' ||
    (!isProduction &&
      process.env.SWAGGER_ENABLED !==
        'false');

  // 1. SEGURIDAD: Helmet para protección de cabeceras HTTP
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [
            `'self'`,
            `'unsafe-inline'`,
          ],
          imgSrc: [
            `'self'`,
            'data:',
            'validator.swagger.io',
          ],
          scriptSrc: [
            `'self'`,
            'https:',
            `'unsafe-inline'`,
          ],
        },
      },
    }),
  );

  // 2. SEGURIDAD: CORS restringido con whitelist de dominios
  const corsWhitelistEnv =
    process.env.CORS_ORIGINS || '';

  const corsWhitelist =
    corsWhitelistEnv
      ? corsWhitelistEnv
          .split(',')
          .map((origin) =>
            origin.trim(),
          )
          .filter(Boolean)
      : [
          'http://localhost:3000',
          'http://localhost:5173',
          'https://coimsa.erp.local',
          'https://induwork.erp.local',
          'https://inversionesmvi.erp.local',
        ];

  app.enableCors({
    origin: (
      origin,
      callback,
    ) => {
      if (
        !origin ||
        corsWhitelist.includes(
          origin,
        ) ||
        !isProduction
      ) {
        callback(null, true);
        return;
      }

      callback(
        new Error(
          'Acceso bloqueado por política CORS.',
        ),
      );
    },
    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'x-tenant-id',
      'x-company-id',
    ],
    exposedHeaders: [
      'x-tenant-id',
    ],
    credentials: true,
  });

  // 3. SEGURIDAD & VALIDACIÓN
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 4. Prefijo Global de Rutas
  app.setGlobalPrefix('api/v1', {
    exclude: [
      'docs',
      'docs-json',
      'health',
    ],
  });

  // 5. DOCUMENTACIÓN OPENAPI / SWAGGER
  if (swaggerEnabled) {
    const swaggerConfig =
      new DocumentBuilder()
        .setTitle(
          'Induwork ERP Multi-Tenant API (Chile)',
        )
        .setDescription(
          `
### Plataforma ERP Corporativa Multi-Empresa

API centralizada para la operación unificada de:

- Coimsa SpA
- Induwork SpA
- Inversiones MVI SpA

---

### SEGURIDAD

- Multi-tenancy con aislamiento por empresa.
- Autenticación JWT.
- Refresh token con rotación y persistencia segura.
- Contraseñas protegidas con Argon2.
- Control de acceso basado en roles.
- Rate limiting.
- Helmet.
- Validación estricta de DTOs.

---

### FUNCIONALIDADES

- Usuarios y roles
- Productos y variantes
- Inventario y Kardex
- Clientes
- Órdenes de venta
- Facturación
- Pagos
- Compras
- Recepciones
- Conciliación de compras
- Pricing y promociones
- Storage
- Notificaciones
- Auditoría

---

### ESTADO

Las funcionalidades deben considerarse implementadas,
parciales/preparadas o roadmap según el estado real del
código y sus integraciones externas.

No se considera una integración de producción aquello que
permanezca simulado, incompleto o pendiente de configuración.
          `,
        )
        .setVersion('1.0.0')
        .setContact(
          'Equipo de Ingeniería Induwork ERP',
          'https://induwork.cl',
          'soporte@induwork.cl',
        )
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            name: 'JWT Authorization',
            description:
              'Ingresa tu Access Token JWT sin anteponer la palabra Bearer.',
            in: 'header',
          },
          'access-token',
        )
        .addTag(
          'Auth',
          'Autenticación, Login, Refresh Tokens y Perfil',
        )
        .addTag(
          'Tenants',
          'Gestión y consulta de Empresas',
        )
        .addTag(
          'Users',
          'Administración de usuarios y roles RBAC',
        )
        .addTag(
          'Products',
          'Catálogo de productos y variantes',
        )
        .addTag(
          'Inventory',
          'Control de stock y movimientos',
        )
        .addTag(
          'Pricing & Promotions',
          'Listas de precios, promociones y fidelización',
        )
        .addTag(
          'Orders',
          'Gestión de órdenes de venta',
        )
        .addTag(
          'Invoicing & Payments',
          'Facturación y pagos',
        )
        .addTag(
          'Storage',
          'Almacenamiento de archivos',
        )
        .addTag(
          'Notifications',
          'Alertas y notificaciones internas',
        )
        .build();

    const document =
      SwaggerModule.createDocument(
        app,
        swaggerConfig,
      );

    SwaggerModule.setup(
      'docs',
      app,
      document,
      {
        swaggerOptions: {
          persistAuthorization: true,
          docExpansion: 'none',
          filter: true,
        },
        customSiteTitle:
          'Documentación API - Induwork ERP Multi-Tenant',
      },
    );

    logger.log(
      'Swagger habilitado en /docs',
    );
  } else {
    logger.log(
      'Swagger deshabilitado.',
    );
  }

  // 6. Iniciar servidor
  const port =
    process.env.PORT || 4000;

  await app.listen(port);

  logger.log(
    `Servidor ejecutándose en: http://localhost:${port}/api/v1`,
  );

  if (swaggerEnabled) {
    logger.log(
      `Documentación Swagger disponible en: http://localhost:${port}/docs`,
    );
  }
}

bootstrap();