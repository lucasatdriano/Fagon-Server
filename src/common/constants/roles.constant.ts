import { UserRole } from '@prisma/client';

export const ROLES = {
  ADMIN: UserRole.admin,
  FUNCIONARIO: UserRole.funcionario,
  VISTORIADOR: UserRole.vistoriador,
} as const;
