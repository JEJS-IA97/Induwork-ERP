import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Conexión exitosa a PostgreSQL mediante Prisma ORM');
    } catch (error) {
      this.logger.warn(
        '⚠️ No se pudo conectar a la base de datos inmediatamente. Verifica tu DATABASE_URL en .env',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Conexión con PostgreSQL cerrada');
  }
}
