import {
  Module,
  NestModule,
  MiddlewareConsumer,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';

// Database & Core
import { PrismaModule } from './database/prisma.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantAccessGuard } from './common/guards/tenant-access.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

// Business Domain Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { StorageModule } from './modules/storage/storage.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { LogisticsModule } from './modules/logistics/logistics.module';

function getEnvString(
  config: Record<string, unknown>,
  key: string,
): string {
  const value = config[key];

  return typeof value === 'string' ? value.trim() : '';
}

function getEnvBoolean(
  config: Record<string, unknown>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = getEnvString(config, key).toLowerCase();

  if (!value) {
    return defaultValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(
    `La variable de entorno ${key} debe ser true o false.`,
  );
}

function getPositiveIntegerEnv(
  config: Record<string, unknown>,
  key: string,
  defaultValue: number,
): number {
  const rawValue = getEnvString(config, key);

  if (!rawValue) {
    return defaultValue;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(
      `La variable de entorno ${key} debe ser un entero mayor que cero.`,
    );
  }

  return parsedValue;
}

function isPlaceholderSecret(value: string): boolean {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();

  return (
    normalized.includes('change_me') ||
    normalized.includes('changeme') ||
    normalized.includes('replace_me') ||
    normalized.includes('your_') ||
    normalized.includes('example')
  );
}

function validateConfiguration(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv =
    getEnvString(config, 'NODE_ENV').toLowerCase() ||
    'development';

  const jwtSecret = getEnvString(
    config,
    'JWT_SECRET',
  );
  const jwtRefreshSecret = getEnvString(
    config,
    'JWT_REFRESH_SECRET',
  );

  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  const missing = required.filter(
    (key) => !getEnvString(config, key),
  );

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}`,
    );
  }

  if (jwtSecret === jwtRefreshSecret) {
    throw new Error(
      'JWT_SECRET y JWT_REFRESH_SECRET deben ser diferentes.',
    );
  }

  if (nodeEnv === 'production') {
    if (
      jwtSecret.length < 32 ||
      jwtRefreshSecret.length < 32
    ) {
      throw new Error(
        'En producción, JWT_SECRET y JWT_REFRESH_SECRET deben tener al menos 32 caracteres cada uno.',
      );
    }

    if (
      isPlaceholderSecret(jwtSecret) ||
      isPlaceholderSecret(jwtRefreshSecret)
    ) {
      throw new Error(
        'En producción no se permiten secretos JWT de ejemplo o placeholder.',
      );
    }

    const corsOrigins = getEnvString(
      config,
      'CORS_ORIGINS',
    );

    if (!corsOrigins) {
      throw new Error(
        'CORS_ORIGINS debe estar definido explícitamente en producción.',
      );
    }

    const configuredOrigins = corsOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (configuredOrigins.length === 0) {
      throw new Error(
        'CORS_ORIGINS debe contener al menos un origen válido en producción.',
      );
    }

    const insecureOrigins = configuredOrigins.filter(
      (origin) =>
        /^http:\/\/localhost(?::\d+)?$/i.test(origin) ||
        /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin),
    );

    if (insecureOrigins.length > 0) {
      throw new Error(
        `No se permiten origins de localhost/127.0.0.1 en producción: ${insecureOrigins.join(', ')}`,
      );
    }

    const swaggerEnabled = getEnvBoolean(
      config,
      'SWAGGER_ENABLED',
      false,
    );

    if (swaggerEnabled) {
      throw new Error(
        'Swagger debe permanecer deshabilitado en producción.',
      );
    }

    const storageMockMode = getEnvBoolean(
      config,
      'STORAGE_MOCK_MODE',
      false,
    );

    if (storageMockMode) {
      throw new Error(
        'STORAGE_MOCK_MODE no puede estar habilitado en producción.',
      );
    }

    const publicRegistrationEnabled = getEnvBoolean(
      config,
      'PUBLIC_REGISTRATION_ENABLED',
      false,
    );

    const publicRegistrationTenantCode = getEnvString(
      config,
      'PUBLIC_REGISTRATION_TENANT_CODE',
    );

    if (
      publicRegistrationEnabled &&
      !publicRegistrationTenantCode
    ) {
      throw new Error(
        'PUBLIC_REGISTRATION_TENANT_CODE es obligatorio cuando PUBLIC_REGISTRATION_ENABLED=true en producción.',
      );
    }

    const webpayReturnUrl = getEnvString(
      config,
      'WEBPAY_RETURN_URL',
    );

    if (webpayReturnUrl && !/^https:\/\//i.test(webpayReturnUrl)) {
      throw new Error(
        'WEBPAY_RETURN_URL debe utilizar HTTPS en producción.',
      );
    }

    const storagePublicUrl = getEnvString(
      config,
      'S3_PUBLIC_URL',
    );

    if (
      storagePublicUrl &&
      !/^https:\/\//i.test(storagePublicUrl)
    ) {
      throw new Error(
        'S3_PUBLIC_URL debe utilizar HTTPS en producción.',
      );
    }
  }

  return config;
}

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: validateConfiguration,
    }),

    // Rate Limiting (Throttler)
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => [
        {
          ttl: getPositiveIntegerEnv(
            process.env as Record<string, unknown>,
            'THROTTLE_TTL',
            60000,
          ),
          limit: getPositiveIntegerEnv(
            process.env as Record<string, unknown>,
            'THROTTLE_LIMIT',
            60,
          ),
        },
      ],
    }),

    // Global Database Module
    PrismaModule,

    // Domain Modules
    AuthModule,
    UsersModule,
    TenantsModule,
    ProductsModule,
    InventoryModule,
    OrdersModule,
    InvoicingModule,
    StorageModule,
    PaymentsModule,
    NotificationsModule,
    PricingModule,
    PurchasesModule,
    LogisticsModule,
  ],
  providers: [
    // Global Throttler Rate Limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global JWT Authentication Guard (respects @Public())
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global Roles Guard (RBAC)
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Global Tenant Access Isolation Guard
    {
      provide: APP_GUARD,
      useClass: TenantAccessGuard,
    },
    // Global Structured Exceptions Filter
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
