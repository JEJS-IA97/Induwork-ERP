import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentTenant = createParamDecorator(
  (data: 'id' | 'code' | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.tenantId || request.user?.tenantId;
    const tenantCode = request.tenantCode || request.user?.tenantCode;

    if (data === 'code') {
      return tenantCode;
    }
    if (data === 'id') {
      return tenantId;
    }

    return {
      id: tenantId,
      code: tenantCode,
    };
  },
);
