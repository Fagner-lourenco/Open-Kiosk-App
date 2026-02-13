type BadgeVariant = 'default' | 'secondary' | 'outline';

const ROLE_ALIASES: Record<string, string> = {
  employee: 'operator',
};

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  owner: 'Proprietario',
  admin: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
  employee: 'Operador',
  technician: 'Tecnico',
  viewer: 'Visualizador',
};

const ROLE_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  superadmin: 'default',
  owner: 'default',
  admin: 'secondary',
  manager: 'secondary',
  operator: 'outline',
  employee: 'outline',
  technician: 'outline',
  viewer: 'outline',
};

export interface RoleOption {
  value: string;
  label: string;
}

export const FRANCHISE_ROLE_OPTIONS: RoleOption[] = [
  { value: 'manager', label: 'Gerente' },
  { value: 'employee', label: 'Operador' },
  { value: 'viewer', label: 'Visualizador' },
];

export const STORE_ROLE_OPTIONS: RoleOption[] = [
  { value: 'manager', label: 'Gerente' },
  { value: 'operator', label: 'Operador' },
  { value: 'viewer', label: 'Visualizador' },
];

export function normalizeRole(role?: string): string {
  if (!role) return 'viewer';
  return ROLE_ALIASES[role] || role;
}

export function isOperatorRole(role?: string): boolean {
  return normalizeRole(role) === 'operator';
}

export function getRoleLabel(role?: string): string {
  if (!role) return 'Membro';
  return ROLE_LABELS[role] || ROLE_LABELS[normalizeRole(role)] || role;
}

export function getRoleBadge(role?: string): { label: string; variant: BadgeVariant } {
  const normalizedRole = normalizeRole(role);

  return {
    label: getRoleLabel(role),
    variant: ROLE_BADGE_VARIANTS[normalizedRole] || 'outline',
  };
}
