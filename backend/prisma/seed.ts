import { PrismaClient, Role, CustomerType, StockMovementType, ProductDocumentType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando siembra (Seeding) de Base de Datos para ERP Multi-Tenant...');

  const defaultPassword = 'AdminPassword2026!';
  const passwordHash = await argon2.hash(defaultPassword);

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
    },
  ];

  for (const tenantData of initialTenants) {
    // 1. Crear / Actualizar Empresa Tenant
    const tenant = await prisma.tenant.upsert({
      where: { code: tenantData.code },
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
      create: tenantData,
    });

    console.log(`\n🏢 Empresa Registrada: ${tenant.name} (${tenant.code}) -> ID: ${tenant.id}`);

    // 2. Crear Administrador por defecto
    const adminEmail = `admin@${tenant.code}.erp.local`;
    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        role: Role.ADMIN,
        passwordHash,
        tenantId: tenant.id,
      },
      create: {
        email: adminEmail,
        passwordHash,
        firstName: 'Administrador',
        lastName: tenant.name,
        role: Role.ADMIN,
        tenantId: tenant.id,
      },
    });

    console.log(`   👤 Admin: ${adminUser.email} (Clave: ${defaultPassword})`);

    // 3. Crear Categorías de Producto de ejemplo
    const maquinariaCategory = await prisma.productCategory.upsert({
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
        description: 'Equipos pesados y bombas para minería e industria',
      },
    });

    const eppCategory = await prisma.productCategory.upsert({
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
        description: 'Cascos, calzado de seguridad, guantes y arneses',
      },
    });

    // 4. Crear Etiquetas (Tags)
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

    const tagOferta = await prisma.productTag.upsert({
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

    // 5. Crear Cliente y Proveedor de prueba
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

    // 6. Crear Producto Completo con variantes, imágenes, ficha técnica y stock
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
        webName: 'Bomba Centrífuga Sumergible Industrial 10HP de Alto Rendimiento para Minería y Construcción',
        orderName: 'Bomba Centrífuga Sumergible 10HP 380V',
        description: 'Bomba sumergible de lodos para faenas mineras y drenaje industrial.',
        webDescription: 'Nuestra bomba centrífuga sumergible industrial de 10HP ofrece un caudal máximo de 120 m³/h y una altura de elevación de hasta 35 metros. Fabricada en aleación de hierro dúctil y cromo resistente a la abrasión con sello mecánico dual de carburo de silicio.',
        orderDescription: 'Bomba Sumergible 10HP 380V / 120m3/h / Eje Inox',
        price: 1850000.0,
        cost: 1120000.0,
        taxRate: 19.0,
        taxIncluded: false,
        mainImageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
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

    // Asignar Etiqueta
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

    // Imágenes para Carrusel
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
          altText: 'Conexiones hidráulicas y panel de control',
          isMain: false,
          orderIndex: 1,
        },
      ],
    });

    // Documento Técnico adjunto (Ficha Técnica / Manual)
    await prisma.productDocument.create({
      data: {
        tenantId: tenant.id,
        productId: sampleProduct.id,
        title: 'Ficha Técnica Oficial - Bomba Sumergible 10HP Serie IND',
        fileUrl: 'https://storage.induwork.cl/fichas/FT-BOMBA-10HP-2026.pdf',
        fileType: 'application/pdf',
        fileSize: 2450890,
        documentType: ProductDocumentType.FICHA_TECNICA,
        isPublic: true,
      },
    });

    // Variantes (380V vs 440V)
    const variant380 = await prisma.productVariant.upsert({
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
        attributes: { voltaje: '380V', frecuencia: '50Hz', proteccion: 'IP68' },
      },
    });

    const variant440 = await prisma.productVariant.upsert({
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
        attributes: { voltaje: '440V', frecuencia: '60Hz', proteccion: 'IP68 Heavy Duty' },
      },
    });

    // Existencias de Stock por Almacén y Variante
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

    // Movimiento Inicial de Inventario (Kardex)
    await prisma.stockMovement.create({
      data: {
        tenantId: tenant.id,
        productId: sampleProduct.id,
        variantId: variant380.id,
        type: StockMovementType.ENTRADA,
        quantity: 25,
        unitCost: 1120000.0,
        warehouseLocation: 'BODEGA_CENTRAL',
        reference: 'Recepción Inicial de Importación Lote #2026-A1',
        createdById: adminUser.id,
      },
    });

    // Registro de Auditoría Inicial
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

    console.log(`   📦 Producto de ejemplo creado: ${sampleProduct.name} (SKU: ${sampleProduct.sku})`);
    console.log(`   📑 Ficha técnica, variantes (380V / 440V) y stock inicial en BODEGA_CENTRAL configurados.`);
  }

  console.log('\n✅ Proceso de siembra (Seeding) finalizado exitosamente.');
}

main()
  .catch((e) => {
    console.error('❌ Error durante la siembra de base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
