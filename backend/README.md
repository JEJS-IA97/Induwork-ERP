# Induwork ERP - Backend Multi-Tenant (NestJS + TypeScript)

Backend robusto, escalable y seguro desarrollado en **NestJS** con **TypeScript**, diseñado para la gestión empresarial multi-tenant de 3 empresas:
- 🏢 **Coimsa SpA** (`Coimsa`)
- 🏢 **Induwork SpA** (`induwork`)
- 🏢 **Inversiones MVI SpA** (`inversiones-mvi`)

---

## 🏛️ Arquitectura Modular por Dominio

El proyecto sigue una arquitectura limpia basada en dominios de negocio:

```text
src/
├── common/                     # Componentes transversales
│   ├── constants/              # Enums de Roles, Tenants y Constantes
│   ├── decorators/             # @Roles(), @CurrentUser(), @CurrentTenant(), @Public()
│   ├── filters/                # Filtro global de excepciones estructuradas
│   ├── guards/                 # JwtAuthGuard, RolesGuard, TenantAccessGuard
│   ├── middleware/             # TenantMiddleware (extracción de x-tenant-id)
│   └── types/                  # Extensiones de tipos para Express Request
├── database/                   # Conexión ORM
│   ├── prisma.service.ts       # Ciclo de vida y conexión con PostgreSQL
│   └── prisma.module.ts        # Módulo global exportable
├── modules/                    # Dominios de Negocio (10 módulos)
│   ├── auth/                   # Autenticación JWT, Refresh Tokens, Argon2
│   ├── users/                  # Administración de usuarios y RBAC
│   ├── tenants/                # Empresas (Coimsa, Induwork, Inversiones MVI)
│   ├── products/               # Catálogo de productos multi-tenant
│   ├── inventory/              # Existencias en almacén y Kardex de movimientos
│   ├── orders/                 # Órdenes de compra y pedidos
│   ├── invoicing/              # Facturación electrónica
│   ├── storage/                # Almacenamiento y registro de archivos
│   ├── payments/               # Transacciones y pagos recibidos
│   └── notifications/          # Sistema de alertas para usuarios
├── app.module.ts               # Módulo raíz
└── main.ts                     # Bootstrap, Helmet, CORS, ValidationPipe, Swagger
```

---

## 🔒 Características de Seguridad Implementadas

1. **Helmet**: Protección activa de cabeceras HTTP (Content-Security-Policy, X-Frame-Options, XSS Protection).
2. **CORS con Whitelist**: Control riguroso de orígenes autorizados configurable mediante `CORS_ORIGINS`.
3. **Rate Limiting Global (`@nestjs/throttler`)**: Prevención de ataques de fuerza bruta y DDoS (60 peticiones/min por defecto).
4. **Validación Estricta (`ValidationPipe`)**: Limpieza y validación de DTOs con `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.
5. **Criptografía con Argon2**: Algoritmo de hashing de contraseñas de última generación, superior y más seguro que bcrypt.
6. **Tokens Duales JWT**:
   - **Access Token**: Expiración corta (15 minutos).
   - **Refresh Token**: Expiración prolongada (7 días) con rotación y persistencia segura en base de datos.
7. **Control de Acceso Basado en Roles (RBAC)**:
   - `ADMIN`: Acceso administrativo total.
   - `FINANCE`: Gestión de facturas, pagos y órdenes.
   - `INVENTORY_MANAGER`: Administración de almacenes, productos y movimientos de stock.
   - `VENDEDOR`: Creación y seguimiento de órdenes y catálogo de productos.
8. **Aislamiento Multi-Tenant**:
   - Extracción automática de la cabecera `x-tenant-id`.
   - Validación de pertenencia mediante `TenantAccessGuard` para impedir cruce de datos entre empresas.

---

## 📚 Documentación Interactiva OpenAPI / Swagger

La documentación Swagger está disponible en:
👉 **`http://localhost:4000/docs`**

Incluye:
- Soporte para **Bearer JWT Token** en el botón `Authorize`.
- Agrupación por etiquetas de los 10 dominios de negocio.
- Descripción de esquemas DTOs y respuestas HTTP estructuradas.

---

## 🚀 Puesta en Marcha

### 1. Requisitos Previos
- **Node.js**: v20+ o v22+
- **PostgreSQL**: Instancia local o remota en ejecución

### 2. Configuración de Variables de Entorno
Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```

Configura tu cadena de conexión en `DATABASE_URL`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/induwork_erp?schema=public"
```

### 3. Instalación de Dependencias
```bash
npm install
```

### 4. Migración y Semilla de Base de Datos
Genera el cliente Prisma y siembra las empresas iniciales (**Coimsa**, **Induwork**, **Inversiones MVI**) y usuarios administradores:
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

> **Credenciales de prueba generadas por la semilla**:
> - `admin@Coimsa.erp.local` / `AdminPassword2026!` (Empresa: Coimsa S.A.)
> - `admin@induwork.erp.local` / `AdminPassword2026!` (Empresa: Induwork SpA)
> - `admin@inversionesmvi.erp.local` / `AdminPassword2026!` (Empresa: Inversiones MVI Ltda.)

### 5. Iniciar la Aplicación

**Modo Desarrollo**:
```bash
npm run start:dev
```

**Modo Producción**:
```bash
npm run build
npm run start:prod
```

---

## 📡 Ejemplo de Peticiones HTTP

### Iniciar Sesión (Login)
```bash
POST http://localhost:4000/api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@Coimsa.erp.local",
  "password": "AdminPassword2026!"
}
```

### Petición con Multi-Tenant y Bearer Token
```bash
GET http://localhost:4000/api/v1/products
Authorization: Bearer <TU_ACCESS_TOKEN>
x-tenant-id: Coimsa
```
