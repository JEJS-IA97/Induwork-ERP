const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: {
      code: 'coimsa',
    },
  });

  if (!tenant) {
    throw new Error('No existe el tenant coimsa');
  }

  console.log('Tenant encontrado:', tenant.id);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.customer.create({
        data: {
          tenantId: tenant.id,
          type: 'CLIENTE',
          rutOrTaxId: 'DEBUG-79.111.222-3',
          name: 'DEBUG CUSTOMER',
          email: 'debug@induwork.local',
          phone: '+56 9 0000 0000',
        },
      });

      throw new Error('ROLLBACK_DEBUG');
    });
  } catch (error) {
    console.error('\n=== RESULTADO ===');
    console.error(error);
  }
}

main()
  .catch((error) => {
    console.error('\n=== ERROR FATAL ===');
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
