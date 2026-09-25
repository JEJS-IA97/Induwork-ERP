import {
  PrismaClient,
  Role,
  CustomerType,
  StockMovementType,
  ProductDocumentType,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `La variable de entorno ${name} es obligatoria para ejecutar el seed.`,
    );
  }

  return value;
}

function getEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function main() {
  console.log(
    '🌱 Iniciando siembra (Seeding) de Base de Datos para ERP Multi-Tenant...',
  );

  const isProduction = process.env.NODE_ENV === 'production';

  if (
    isProduction &&
    process.env.ALLOW_PRODUCTION_SEED !== 'true'
  ) {
    throw new Error(
      'El seed está bloqueado en producción. Configure ALLOW_PRODUCTION_SEED=true únicamente si la siembra es intencional.',
    );
  }

  const defaultPassword = getRequiredEnv('SEED_ADMIN_PASSWORD');

  const systemAdminPassword = getEnv(
    'SEED_SYSTEM_ADMIN_PASSWORD',
    defaultPassword,
  );

  if (defaultPassword.length < 12) {
    throw new Error(
      'SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres.',
    );
  }

  if (systemAdminPassword.length < 12) {
    throw new Error(
      'SEED_SYSTEM_ADMIN_PASSWORD debe tener al menos 12 caracteres.',
    );
  }

  const adminPasswordHash = await argon2.hash(defaultPassword);
  const systemAdminPasswordHash = await argon2.hash(
    systemAdminPassword,
  );

  /*
   * IMPORTANTE:
   *
   * Los correos de los administradores iniciales no forman parte de la
   * arquitectura del ERP. Son solamente la configuración inicial de esta
   * instalación.
   *
   * Pueden modificarse mediante variables de entorno al instalar el sistema
   * para otra empresa/cliente.
   */
  const systemAdminEmail = normalizeEmail(
    getEnv(
      'SEED_SYSTEM_ADMIN_EMAIL',
      'soporte@induwork.cl',
    ),
  );

  const initialTenants = [
    {
      code: 'coimsa',
      name: 'Coimsa SpA',
      domain: 'coimsa.erp.local',
      rutOrTaxId: '76.123.456-7',
      email: 'administracion@coimsa.cl',
      phone: '+56 9 9361 9179',
      address: 'Valentin Letelier 1373 of 202, Santiago',
      city: 'Santiago',
      country: 'Chile',
      adminEmail: normalizeEmail(
        getEnv(
          'SEED_COIMSA_ADMIN_EMAIL',
          'administracion@coimsaspa.cl',
        ),
      ),
    },
    {
      code: 'induwork',
      name: 'Induwork SpA',
      domain: 'induwork.erp.local',
      rutOrTaxId: '77.987.654-3',
      email: 'ventas@induwork.cl',
      phone: '+56 9 9361 9179',
      address: 'Antonio Bellet 193, Oficina 1210, Providencia',
      city: 'Santiago',
      country: 'Chile',
      adminEmail: normalizeEmail(
        getEnv(
          'SEED_INDUWORK_ADMIN_EMAIL',
          'gerencia@induwork.cl',
        ),
      ),
    },
    {
      code: 'inversiones-mvi',
      name: 'Inversiones MVI SpA.',
      domain: 'inversionesmvi.erp.local',
      rutOrTaxId: '78.555.666-9',
      email: 'administracion@inversionesmvi.cl',
      phone: '+56 9 7489 6223',
      address: 'Antonio Bellet 193, Oficina 1210, Providencia',
      city: 'Santiago',
      country: 'Chile',
      adminEmail: normalizeEmail(
        getEnv(
          'SEED_INVERSIONES_MVI_ADMIN_EMAIL',
          'administracion@inversionesmvi.cl',
        ),
      ),
    },
  ];

  const tenantsByCode: Record<
    string,
    {
      id: string;
      code: string;
      name: string;
    }
  > = {};

  /*
   * ==========================================================================
   * 1. CREAR / ACTUALIZAR EMPRESAS
   * ==========================================================================
   */

  for (const tenantData of initialTenants) {
    const tenant = await prisma.tenant.upsert({
      where: {
        code: tenantData.code,
      },
      update: {
        name: tenantData.name,
        domain: tenantData.domain,
        rutOrTaxId: tenantData.rutOrTaxId,
        email: tenantData.email,
        phone: tenantData.phone,
        address: tenantData.address,
        city: tenantData.city,
        country: tenantData.country,
      },
      create: {
        code: tenantData.code,
        name: tenantData.name,
        domain: tenantData.domain,
        rutOrTaxId: tenantData.rutOrTaxId,
        email: tenantData.email,
        phone: tenantData.phone,
        address: tenantData.address,
        city: tenantData.city,
        country: tenantData.country,
      },
    });

    tenantsByCode[tenant.code] = {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
    };

    console.log(
      `\n🏢 Empresa registrada: ${tenant.name} (${tenant.code}) -> ID: ${tenant.id}`,
    );
  }

  /*
   * ==========================================================================
   * 2. CREAR / ACTUALIZAR SYSTEM_ADMIN GLOBAL
   * ==========================================================================
   *
   * El schema actual obliga a que User.tenantId tenga valor.
   * SYSTEM_ADMIN tiene permisos globales y RolesGuard ya ignora el tenant
   * para este rol, por lo que usamos Induwork como tenant técnico de referencia.
   *
   * Esto no limita al SYSTEM_ADMIN a Induwork.
   */

  const systemAdminTenant = tenantsByCode.induwork;

  if (!systemAdminTenant) {
    throw new Error(
      'No se encontró el tenant de referencia "induwork" para SYSTEM_ADMIN.',
    );
  }

  const systemAdmin = await prisma.user.upsert({
    where: {
      email: systemAdminEmail,
    },
    update: {
      role: Role.SYSTEM_ADMIN,
      passwordHash: systemAdminPasswordHash,
      tenantId: systemAdminTenant.id,
      firstName: 'Super',
      lastName: 'Administrador',
      isActive: true,
    },
    create: {
      email: systemAdminEmail,
      passwordHash: systemAdminPasswordHash,
      firstName: 'Super',
      lastName: 'Administrador',
      role: Role.SYSTEM_ADMIN,
      tenantId: systemAdminTenant.id,
      isActive: true,
    },
  });

  console.log(
    `\n👑 SYSTEM_ADMIN configurado: ${systemAdmin.email}`,
  );

  /*
   * ==========================================================================
   * 3. DATOS INICIALES DE CADA TENANT
   * ==========================================================================
   */

  for (const tenantData of initialTenants) {
    const tenant = tenantsByCode[tenantData.code];

    if (!tenant) {
      throw new Error(
        `No se encontró información para el tenant '${tenantData.code}'.`,
      );
    }

    /*
     * ------------------------------------------------------------------------
     * 3.1 ADMINISTRADOR DE EMPRESA
     * ------------------------------------------------------------------------
     *
     * Este usuario tiene rol ADMIN y queda limitado al tenant correspondiente.
     * El SYSTEM_ADMIN puede crear estos usuarios porque RolesGuard reconoce
     * SYSTEM_ADMIN como rol global.
     */

    const adminUser = await prisma.user.upsert({
      where: {
        email: tenantData.adminEmail,
      },
      update: {
        role: Role.ADMIN,
        passwordHash: adminPasswordHash,
        tenantId: tenant.id,
        firstName: 'Administrador',
        lastName: tenant.name,
        isActive: true,
      },
      create: {
        email: tenantData.adminEmail,
        passwordHash: adminPasswordHash,
        firstName: 'Administrador',
        lastName: tenant.name,
        role: Role.ADMIN,
        tenantId: tenant.id,
        isActive: true,
      },
    });

    console.log(
      `   👤 ADMIN configurado: ${adminUser.email} -> ${tenant.name}`,
    );

    /*
     * ------------------------------------------------------------------------
     * 3.2 CATEGORÍAS DE PRODUCTO
     * ------------------------------------------------------------------------
     */

    const maquinariaCategory =
      await prisma.productCategory.upsert({
        where: {
          tenantId_slug: {
            tenantId: tenant.id,
            slug: 'maquinaria-industrial',
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          name: 'Maquinaria Industrial',
          slug: 'maquinaria-industrial',
          description:
            'Equipos pesados y bombas para minería e industria',
        },
      });

    await prisma.productCategory.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: 'equipos-seguridad-epp',
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Equipos de Protección Personal (EPP)',
        slug: 'equipos-seguridad-epp',
        description:
          'Cascos, calzado de seguridad, guantes y arneses',
      },
    });

    /*
     * ------------------------------------------------------------------------
     * 3.3 ETIQUETAS
     * ------------------------------------------------------------------------
     */

    const tagDestacado = await prisma.productTag.upsert({
      where: {
        tenantId_name: {
          tenantId: tenant.id,
          name: 'Destacado Web',
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Destacado Web',
        color: '#10B981',
      },
    });

    await prisma.productTag.upsert({
      where: {
        tenantId_name: {
          tenantId: tenant.id,
          name: 'Oferta Temporada',
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Oferta Temporada',
        color: '#EF4444',
      },
    });

    /*
     * ------------------------------------------------------------------------
     * 3.4 CLIENTE DE PRUEBA
     * ------------------------------------------------------------------------
     */

    const sampleCustomer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        type: CustomerType.CLIENTE,
        rutOrTaxId: '79.111.222-3',
        name: `Cliente Corporativo Minero ${tenant.code.toUpperCase()}`,
        email: `adquisiciones@minera-${tenant.code}.cl`,
        phone: '+56 9 8888 7777',
        address: 'Camino Minero Km 15',
        city: tenantData.city || 'Santiago',
      },
    });

    void sampleCustomer;

    /*
     * ------------------------------------------------------------------------
     * 3.5 PRODUCTO DE PRUEBA
     * ------------------------------------------------------------------------
     */

    const productSku = `PROD-${tenant.code.toUpperCase()}-001`;

    const sampleProduct = await prisma.product.upsert({
      where: {
        tenantId_sku: {
          tenantId: tenant.id,
          sku: productSku,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sku: productSku,
        barcode: '7801234567890',
        name: 'Bomba Centrífuga Sumergible 10HP Trifásica',
        webName:
          'Bomba Centrífuga Sumergible Industrial 10HP de Alto Rendimiento para Minería y Construcción',
        orderName:
          'Bomba Centrífuga Sumergible 10HP 380V',
        description:
          'Bomba sumergible de lodos para faenas mineras y drenaje industrial.',
        webDescription:
          'Nuestra bomba centrífuga sumergible industrial de 10HP ofrece un caudal máximo de 120 m³/h y una altura de elevación de hasta 35 metros. Fabricada en aleación de hierro dúctil y cromo resistente a la abrasión con sello mecánico dual de carburo de silicio.',
        orderDescription:
          'Bomba Sumergible 10HP 380V / 120m3/h / Eje Inox',
        price: 1850000.0,
        cost: 1120000.0,
        taxRate: 19.0,
        taxIncluded: false,
        mainImageUrl:
          'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
        imageUrls: [
          'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80',
        ],
        isActive: true,
        isArchived: false,
        isPublishedWeb: true,
        hasVariants: true,
        salesCount: 14,
        categoryId: maquinariaCategory.id,
      },
    });

    /*
     * ------------------------------------------------------------------------
     * 3.6 ETIQUETA DEL PRODUCTO
     * ------------------------------------------------------------------------
     */

    await prisma.productTagAssignment.upsert({
      where: {
        productId_tagId: {
          productId: sampleProduct.id,
          tagId: tagDestacado.id,
        },
      },
      update: {},
      create: {
        productId: sampleProduct.id,
        tagId: tagDestacado.id,
      },
    });

    /*
     * ------------------------------------------------------------------------
     * 3.7 IMÁGENES
     * ------------------------------------------------------------------------
     */

    await prisma.productImage.createMany({
      data: [
        {
          tenantId: tenant.id,
          productId: sampleProduct.id,
          url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
          altText: 'Vista frontal bomba sumergible',
          isMain: true,
          orderIndex: 0,
        },
        {
          tenantId: tenant.id,
          productId: sampleProduct.id,
          url: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80',
          altText:
            'Conexiones hidráulicas y panel de control',
          isMain: false,
          orderIndex: 1,
        },
      ],
    });

    /*
     * ------------------------------------------------------------------------
     * 3.8 DOCUMENTO TÉCNICO
     * ------------------------------------------------------------------------
     *
     * Se mantiene privado por defecto en esta configuración inicial.
     */

    await prisma.productDocument.create({
      data: {
        tenantId: tenant.id,
        productId: sampleProduct.id,
        title:
          'Ficha Técnica Oficial - Bomba Sumergible 10HP Serie IND',
        fileUrl:
          'https://storage.induwork.cl/fichas/FT-BOMBA-10HP-2026.pdf',
        fileType: 'application/pdf',
        fileSize: 2450890,
        documentType: ProductDocumentType.FICHA_TECNICA,
        isPublic: false,
      },
    });

    /*
     * ------------------------------------------------------------------------
     * 3.9 VARIANTE 380V
     * ------------------------------------------------------------------------
     */

    const variant380 =
      await prisma.productVariant.upsert({
        where: {
          tenantId_sku: {
            tenantId: tenant.id,
            sku: `${productSku}-380V`,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          productId: sampleProduct.id,
          sku: `${productSku}-380V`,
          name: 'Trifásica 380V Standard',
          price: 1850000.0,
          cost: 1120000.0,
          attributes: {
            voltaje: '380V',
            frecuencia: '50Hz',
            proteccion: 'IP68',
          },
        },
      });

    /*
     * ------------------------------------------------------------------------
     * 3.10 VARIANTE 440V
     * ------------------------------------------------------------------------
     */

    const variant440 =
      await prisma.productVariant.upsert({
        where: {
          tenantId_sku: {
            tenantId: tenant.id,
            sku: `${productSku}-440V`,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          productId: sampleProduct.id,
          sku: `${productSku}-440V`,
          name: 'Trifásica 440V Minera Reforzada',
          price: 1980000.0,
          cost: 1210000.0,
          attributes: {
            voltaje: '440V',
            frecuencia: '60Hz',
            proteccion: 'IP68 Heavy Duty',
          },
        },
      });

    /*
     * ------------------------------------------------------------------------
     * 3.11 STOCK 380V
     * ------------------------------------------------------------------------
     */

    await prisma.inventoryStock.upsert({
      where: {
        tenantId_productId_warehouseLocation_variantId: {
          tenantId: tenant.id,
          productId: sampleProduct.id,
          warehouseLocation: 'BODEGA_CENTRAL',
          variantId: variant380.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        productId: sampleProduct.id,
        variantId: variant380.id,
        warehouseLocation: 'BODEGA_CENTRAL',
        currentStock: 25,
        reservedStock: 3,
        minStock: 5,
        maxStock: 50,
      },
    });

    /*
     * ------------------------------------------------------------------------
     * 3.12 STOCK 440V
     * ------------------------------------------------------------------------
     */

    await prisma.inventoryStock.upsert({
      where: {
        tenantId_productId_warehouseLocation_variantId: {
          tenantId: tenant.id,
          productId: sampleProduct.id,
          warehouseLocation: 'BODEGA_CENTRAL',
          variantId: variant440.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        productId: sampleProduct.id,
        variantId: variant440.id,
        warehouseLocation: 'BODEGA_CENTRAL',
        currentStock: 12,
        reservedStock: 0,
        minStock: 3,
        maxStock: 30,
      },
    });

    /*
     * ------------------------------------------------------------------------
     * 3.13 MOVIMIENTO INICIAL DE INVENTARIO
     * ------------------------------------------------------------------------
     */

    await prisma.stockMovement.create({
      data: {
        tenantId: tenant.id,
        productId: sampleProduct.id,
        variantId: variant380.id,
        type: StockMovementType.ENTRADA,
        quantity: 25,
        unitCost: 1120000.0,
        warehouseLocation: 'BODEGA_CENTRAL',
        reference:
          'Recepción Inicial de Importación Lote #2026-A1',
        createdById: adminUser.id,
      },
    });

    /*
     * ------------------------------------------------------------------------
     * 3.14 AUDITORÍA INICIAL
     * ------------------------------------------------------------------------
     */

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: adminUser.id,
        action: 'INITIAL_TENANT_SETUP',
        entityName: 'Tenant',
        entityId: tenant.id,
        ipAddress: '127.0.0.1',
        newValues: {
          tenantCode: tenant.code,
          name: tenant.name,
          adminEmail: adminUser.email,
        },
      },
    });

    console.log(
      `   📦 Producto de ejemplo creado: ${sampleProduct.name} (SKU: ${sampleProduct.sku})`,
    );

    console.log(
      '   📑 Ficha técnica, variantes (380V / 440V) y stock inicial en BODEGA_CENTRAL configurados.',
    );
  }

  /*
   * ==========================================================================
   * 4. RESUMEN
   * ==========================================================================
   */

  console.log('\n✅ Proceso de siembra finalizado exitosamente.');
  console.log('\n🔐 Usuarios iniciales configurados:');
  console.log(
    `   👑 SYSTEM_ADMIN: ${systemAdmin.email}`,
  );

  for (const tenantData of initialTenants) {
    console.log(
      `   🏢 ${tenantData.name}: ADMIN -> ${tenantData.adminEmail}`,
    );
  }

  console.log(
    '\nℹ️ Las contraseñas fueron tomadas exclusivamente desde variables de entorno.',
  );
}

main()
  .catch((error) => {
    console.error(
      '\n❌ Error durante la siembra de base de datos:',
      error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });