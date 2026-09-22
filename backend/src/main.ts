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
        'https://coimsa.erp.local',
        'https://induwork.erp.local',
        'https://inversionesmvi.erp.local',
      ];

  app.enableCors({
    origin: (origin, callback) => {
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
    .setTitle('Induwork ERP Multi-Tenant API (Chile)')
    .setDescription(
      `
### 📊 Plataforma ERP Corporativa Multi-Empresa

API centralizada para la operación unificada de:
* 🏢 **Coimsa S.A.** ('coimsa')
* 🏢 **Induwork SpA** ('induwork')
* 🏢 **Inversiones MVI Ltda.** ('inversiones-mvi')

---

### ✅ FUNCIONALIDADES IMPLEMENTADAS (ESTADO ACTUAL)
1. **Multi-Tenancy Estricto**:
   - Cabecera obligatoria 'x-tenant-id' para inyección automática de empresa y filtrado en PostgreSQL.
   - Restricción por TenantAccessGuard para evitar cruce de información entre empresas.
2. **Seguridad Integral**:
   - Autenticación JWT dual: Access Token (15 min) + Refresh Token seguro (7 días) con rotación.
   - Encriptación de contraseñas con **Argon2**.
   - Control de acceso por roles (ADMIN, FINANCE, INVENTORY_MANAGER, VENDEDOR, USER).
   - Rate limiting global con **@nestjs/throttler** y cabeceras **Helmet**.
3. **Catálogo & Inventario Avanzado (Reemplazo Odoo)**:
   - Nombres y descripciones diferenciadas para Web vs. Impresión de factura.
   - Variantes dinámicas de producto (tallas, voltajes, colores) con atributos JSON y SKU propio.
   - Fichas técnicas, manuales y certificados en PDF por producto.
   - Control de stock por almacén/bodega y trazabilidad transaccional (Kardex: Entradas, Salidas, Ajustes).
4. **Listas de Precios & Motor de Promociones**:
   - Múltiples listas de precios (Mayorista, Minorista, Distribuidores, VIP).
   - Ajustes masivos de precios por porcentaje (+15%, -10%) o valor fijo global / por categoría.
   - Reglas y programas promocionales automáticos (Envío gratis sobre $50.000, 2x1, 3x2 / Comprar X y recibir Y).
   - Generación y canje de cupones de descuento (porcentaje, monto fijo, regalo para próxima orden).
   - Programa de Tarjetas de Lealtad (acumulación y canje de puntos por compras).
5. **Almacenamiento Cloudflare R2 / S3**:
   - Generación de **Presigned URLs** para subida directa cliente -> bucket (12MB imágenes / 5MB PDFs).
   - $0 costo por transferencia de salida (Zero Egress Fees).
6. **Facturación DTE Chile & Pasarelas de Pago**:
   - Emisión de DTEs oficiales SII: Factura Electrónica (Tipo 33), Boleta (Tipo 39), Nota de Crédito (Tipo 61).
   - Generación de XML con Timbre Electrónico TED en Base64.
   - Generación de PDFs con formato oficial SII y subida automática a Cloudflare R2.
   - Integración con **Transbank Webpay Plus** ('transbank-sdk'), Flow y Mercado Pago Chile con webhooks.
7. **Auditoría Inmutable**:
   - Registro en 'AuditLog' de cada creación, modificación, transacción de pago y emisión tributaria.

---

### 🚀 PRÓXIMOS MÓDULOS EN ROADMAP
* 🔄 **Conexión Directa en Vivo con Web Services del SII** (Envío de Sobres SOAP y Consulta de Estado de DTE).
* 📊 **Dashboard Ejecutivo y Reportes Financieros en Tiempo Real** (Margen por empresa, ventas por vendedor, rotación de stock).
* 🚚 **Despachos y Logística** (Guías de despacho Tipo 52 con firma digital en terreno).
* 💻 **Frontend Web Corporativo** (Panel de administración multi-tenant en React / Next.js).
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
        description: 'Ingresa tu Access Token JWT (sin anteponer la palabra Bearer)',
        in: 'header',
      },
      'access-token',
    )
    .addTag('Auth', 'Autenticación, Login, Refresh Tokens y Perfil')
    .addTag('Tenants', 'Gestión y consulta de Empresas/Tenants (Coimsa, Induwork, Inversiones MVI)')
    .addTag('Users', 'Administración de usuarios y roles RBAC')
    .addTag('Products', 'Catálogo de productos, variantes, fichas técnicas y estados de publicación')
    .addTag('Inventory', 'Control de stock por bodega y movimientos transaccionales (Kardex)')
    .addTag('Pricing & Promotions', 'Listas de precios, ajustes masivos %, cupones, promociones automáticas y tarjetas de lealtad')
    .addTag('Orders', 'Gestión de órdenes de venta, cotizaciones y pedidos')
    .addTag('Invoicing & Payments', 'Emisión de DTEs SII Chile, Facturas PDF, Transbank Webpay Plus, Flow y Webhooks')
    .addTag('Storage', 'Subida de archivos vía Presigned URLs (Cloudflare R2 / S3)')
    .addTag('Notifications', 'Alertas y notificaciones internas para usuarios')
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
