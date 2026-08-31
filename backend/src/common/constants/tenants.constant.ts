export const DEFAULT_TENANT_CODES = [
  'Coimsa',
  'induwork',
  'inversiones-mvi',
] as const;

export type DefaultTenantCode = (typeof DEFAULT_TENANT_CODES)[number];

export const TENANT_HEADER = 'x-tenant-id';
