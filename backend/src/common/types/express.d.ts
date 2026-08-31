import { Role } from '../constants/roles.enum';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  tenantId: string;
  tenantCode?: string;
  firstName?: string;
  lastName?: string;
}

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenantCode?: string;
      user?: AuthenticatedUser;
    }
  }
}
