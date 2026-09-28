# Induwork ERP - Backend Multi-Tenant (NestJS + TypeScript)

Backend desarrollado en **NestJS** con **TypeScript**, diseñado para la gestión empresarial multi-tenant de 3 empresas:
- **Coimsa SpA** (`coimsa`)
- **Induwork SpA** (`induwork`)
- **Inversiones MVI SpA** (`inversiones-mvi`)

---

## Arquitectura Modular por Dominio

```text
src/
├── common/                     # Componentes transversales
│   ├── constants/              # Enums de Roles, Tenants y Constantes
│   ├── decorators/             # @Roles(), @CurrentUser(), @CurrentTenant(), @Public()
│   ├── filters/                # Filtro global de excepciones estructuradas
│   ├── guards/                 # JwtAuthGuard, RolesGuard, TenantAccessGuard
│   ├── middleware/             # TenantMiddleware
│   └── types/                  # Extensiones de tipos para Express Request
├── database/                   # Conexión ORM
│   ├── prisma.service.ts       # Ciclo de vida y conexión con PostgreSQL
│   └── prisma.module.ts        # Módulo global exportable
├── modules/                    # Dominios de Negocio
│   ├── auth/                   # Autenticación JWT, Refresh Tokens, Argon2
│   ├── users/                  # Administración de usuarios y RBAC
│   ├── tenants/                # Empresas
│   ├── products/               # Catálogo de productos y variantes
│   ├── inventory/              # Existencias y Kardex
│   ├── orders/                 # Órdenes de venta
│   ├── invoicing/              # Facturación electrónica
│   ├── storage/                # Almacenamiento y registro de archivos
│   ├── payments/               # Transacciones y pagos recibidos
│   ├── notifications/          # Sistema de alertas
│   └── pricing/                # Listas de precios, promociones y fidelización
├── app.module.ts               # Módulo raíz
└── main.ts                     # Bootstrap, Helmet, CORS, ValidationPipe, Swagger
```

---

## Características de Seguridad Implementadas

1. **Helmet**: Protección activa de cabeceras HTTP y Content Security Policy.
2. **CORS con Whitelist**: Control de orígenes autorizados mediante `CORS_ORIGINS`.
3. **Rate Limiting Global**: Protección general mediante `@nestjs/throttler`.
4. **Rate Limiting Específico de Autenticación**:
   - Login: 5 solicitudes/minuto por tracker.
   - Registro público: 3 solicitudes/15 minutos por tracker.
   - Refresh: 10 solicitudes/minuto por tracker.
5. **Validación Estricta**: `whitelist`, `forbidNonWhitelisted` y transformación de DTOs.
6. **Argon2**: Hashing de contraseñas y de refresh tokens persistidos.
7. **Access Tokens de corta duración** y **Refresh Tokens rotados/revocados**.
8. **RBAC global** mediante `RolesGuard`.
9. **Aislamiento Multi-Tenant** mediante `TenantMiddleware` y `TenantAccessGuard`.
10. **Hardening de producción**:
   - Secrets JWT distintos y de mínimo 32 caracteres.
   - CORS explícito en producción.
   - Swagger bloqueado en producción.
   - Storage mock bloqueado en producción.
   - HTTPS obligatorio para `WEBPAY_RETURN_URL` y `S3_PUBLIC_URL` cuando están configurados.
   - Registro público deshabilitado por defecto en producción.
11. **Almacenamiento seguro** con URLs prefirmadas, límites de tamaño, MIME y validación por firma de archivo.
12. **Auditoría de operaciones** mediante `AuditLog`.

---

## Configuración de Variables de Entorno

Usa `.env.example` como plantilla, pero sustituye todos los valores de ejemplo por secretos reales antes de ejecutar el sistema fuera de desarrollo.

Nunca publiques `.env`, credenciales reales, tokens, API keys ni passwords en documentación, commits, tickets o capturas de pantalla.

### Variables especialmente sensibles

```env
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
SEED_ADMIN_PASSWORD=
SEED_SYSTEM_ADMIN_PASSWORD=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
WEBPAY_API_KEY=
FLOW_API_KEY=
FLOW_SECRET_KEY=
MERCADOPAGO_WEBHOOK_SECRET=
```

---

## Puesta en Marcha

### 1. Requisitos Previos

- Node.js v20+ o v22+
- PostgreSQL

### 2. Configuración

Copia `.env.example` a `.env` y sustituye los placeholders.

```bash
cp .env.example .env
```

### 3. Instalación

```bash
npm install
```

### 4. Prisma

```bash
npm run prisma:generate
npm run prisma:migrate
```

El seed es opcional y está bloqueado en producción salvo autorización explícita mediante `ALLOW_PRODUCTION_SEED=true`.

```bash
npm run prisma:seed
```

Las contraseñas del seed se obtienen exclusivamente desde variables de entorno. No existen contraseñas de producción codificadas en el código.

### 5. Desarrollo

```bash
npm run start:dev
```

### 6. Producción

```bash
npm run build
npm run start:prod
```

En producción el proceso de configuración rechaza secretos JWT de ejemplo, CORS no definido, Swagger habilitado, storage mock y otras configuraciones inseguras.

---

## Swagger / OpenAPI

Swagger solo se habilita explícitamente fuera de producción:

```env
SWAGGER_ENABLED=true
```

En producción la aplicación rechaza esta configuración.

URL de desarrollo:

```text
http://localhost:4000/docs
```

---

## Autenticación

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "correo@empresa.cl",
  "password": "<PASSWORD>"
}
```

El endpoint de login tiene un límite específico para reducir ataques automatizados de fuerza bruta.

### Petición autenticada

```http
GET /api/v1/products
Authorization: Bearer <ACCESS_TOKEN>
x-tenant-id: coimsa
```

No almacenes tokens, passwords ni API keys en logs, documentación o código fuente.

---

## Registro Público

El registro público está controlado por:

```env
PUBLIC_REGISTRATION_ENABLED=false
PUBLIC_REGISTRATION_TENANT_CODE=
```

En producción permanece deshabilitado por defecto. Cuando se habilita, `PUBLIC_REGISTRATION_TENANT_CODE` debe indicar explícitamente el tenant autorizado.

Las cuentas creadas por este mecanismo reciben exclusivamente `Role.USER`; `SYSTEM_ADMIN` nunca es asignable mediante el endpoint público.

---

## Verificación de Seguridad Antes de Producción

Como mínimo, antes de desplegar una versión debe verificarse:

```bash
npm run build
npm run lint
npm test
```

El pipeline de CI/CD de seguridad deberá añadirse posteriormente para automatizar SAST, SCA, secret scanning, DAST y dependency review.

La existencia de una funcionalidad en el código no implica por sí sola que esté validada para producción; las integraciones externas y configuraciones de infraestructura deben verificarse por separado.
