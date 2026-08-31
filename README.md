# Induwork ERP (Monorepo / Workspace)

Proyecto ERP Empresarial Multi-Tenant para **Comisa S.A.**, **Induwork SpA** e **Inversiones MVI Ltda.**

---

## 📁 Estructura del Repositorio

```text
Induwork ERP/
├── backend/                  # Backend API en NestJS + TypeScript + Prisma + PostgreSQL
│   ├── prisma/               # Esquema de base de datos y seeder multi-tenant
│   ├── src/                  # Código fuente modular (Auth, Users, Tenants, Products, etc.)
│   ├── package.json          # Dependencias y scripts del backend
│   └── README.md             # Documentación técnica específica del backend
│
└── frontend/                 # Frontend Web Application (React / Next.js / Vue / Angular)
    └── README.md             # Documentación y configuración del frontend
```

---

## 🚀 Inicio Rápido con el Backend

1. **Navegar a la carpeta backend**:
   ```bash
   cd backend
   ```

2. **Configurar variables de entorno**:
   ```bash
   cp .env.example .env
   ```

3. **Ejecutar migraciones y sembrar datos**:
   ```bash
   npm run prisma:migrate
   npm run prisma:seed
   ```

4. **Iniciar servidor en desarrollo**:
   ```bash
   npm run start:dev
   ```

5. **Documentación Swagger / OpenAPI**:
   - URL: `http://localhost:4000/docs`
