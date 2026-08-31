import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 1. SEGURIDAD: Helmet para protección de cabeceras HTTP
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
          scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
        },
      },
    }),
  );

  // 2. SEGURIDAD: CORS Restringido con Whitelist de dominios
  const corsWhitelistEnv = process.env.CORS_ORIGINS || '';
  const corsWhitelist = corsWhitelistEnv
    ? corsWhitelistEnv.split(',').map((origin) => origin.trim())
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://Coimsa.erp.local',
        'https://induwork.erp.local',
        'https://inversionesmvi.erp.local',
      ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl or server-to-server) or in whitelist
      if (!origin || corsWhitelist.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error(`Acceso bloqueado por política CORS: ${origin}`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'x-tenant-id',
      'x-company-id',
    ],
    exposedHeaders: ['x-tenant-id'],
    credentials: true,
  });

  // 3. SEGURIDAD & VALIDACIÓN: ValidationPipe Global
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
    exclude: ['docs', 'docs-json', 'health'],
  });

  // 5. DOCUMENTACIÓN OPENAPI / SWAGGER EN '/docs'
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Induwork ERP Multi-Tenant API')
    .setDescription(
      `
### API Empresarial Multi-Tenant para Gestión ERP

Esta API provee servicios integrales de gestión para las siguientes empresas:
* **Coimsa S.A.** (\`Coimsa\`)
* **Induwork SpA** (\`induwork\`)
* **Inversiones MVI Ltda.** (\`inversiones-mvi\`)

#### Características principales:
* **Multi-Tenancy**: Aislamiento de datos mediante discriminador por empresa y cabecera \`x-tenant-id\`.
* **Autenticación**: JWT Access Token (15 min) + Refresh Token seguro (7 días) con hashing Argon2.
* **Control de Acceso (RBAC)**: Roles \`ADMIN\`, \`FINANCE\`, \`INVENTORY_MANAGER\`, \`VENDEDOR\`.
* **Seguridad**: Helmet, Rate Limiting (Throttler), CORS Whitelist y sanitización estricta de entradas.
      `,
    )
    .setVersion('1.0.0')
    .setContact(
      'Soporte Técnico Induwork ERP',
      'https://induwork.cl',
      'soporte@induwork.cl',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT Authorization',
        description: 'Ingresa tu Access Token JWT (sin incluir la palabra Bearer)',
        in: 'header',
      },
      'access-token',
    )
    .addTag('Auth', 'Autenticación, Login, Refresh Tokens y Perfil')
    .addTag('Tenants', 'Gestión y consulta de Empresas/Tenants (Coimsa, Induwork, Inversiones MVI)')
    .addTag('Users', 'Administración de usuarios y roles RBAC')
    .addTag('Products', 'Catálogo de productos por empresa')
    .addTag('Inventory', 'Control de existencias, almacenes y movimientos (Kardex)')
    .addTag('Orders', 'Gestión de órdenes de venta y pedidos')
    .addTag('Invoicing', 'Emisión y seguimiento de facturas electrónicas')
    .addTag('Payments', 'Registro y conciliación de pagos')
    .addTag('Storage', 'Archivos y documentos multimedia adjuntos')
    .addTag('Notifications', 'Alertas y notificaciones para usuarios')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
    },
    customSiteTitle: 'Documentación API - Induwork ERP Multi-Tenant',
  });

  // 6. Iniciar Servidor
  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`🚀 Servidor ejecutándose en: http://localhost:${port}/api/v1`);
  logger.log(`📚 Documentación Swagger disponible en: http://localhost:${port}/docs`);
}

bootstrap();
