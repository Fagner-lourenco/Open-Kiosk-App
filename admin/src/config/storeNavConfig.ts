/**
 * ============================================================================
 * storeNavConfig — Navegação lateral para Store sub-rotas
 * ============================================================================
 */

import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  ShoppingCart,
  Activity,
  Beer,
  Droplets,
  Wrench,
  Package,
  Boxes,
  BarChart3,
  Users,
  Settings,
} from 'lucide-react';

export interface StoreNavItem {
  label: string;
  href: string; // sub-path relativo a /stores/:storeId
  icon: LucideIcon;
  group: 'overview' | 'operação' | 'catalogo' | 'gestao';
}

export const STORE_NAV_GROUPS: Record<string, string> = {
  overview: 'Visão Geral',
  operação: 'Operação',
  catalogo: 'Catálogo',
  gestao: 'Gestão',
};

export const STORE_NAV_ITEMS: StoreNavItem[] = [
  // Visão geral
  { label: 'Visão Geral', href: '', icon: LayoutDashboard, group: 'overview' },

  // Operação
  { label: 'Pedidos', href: 'orders', icon: ShoppingCart, group: 'operação' },
  { label: 'Operações', href: 'operations', icon: Activity, group: 'operação' },
  { label: 'Barris', href: 'kegs', icon: Beer, group: 'operação' },
  { label: 'Perdas', href: 'wastage', icon: Droplets, group: 'operação' },
  { label: 'Manutenção', href: 'maintenance', icon: Wrench, group: 'operação' },

  // Catálogo
  { label: 'Produtos', href: 'products', icon: Package, group: 'catalogo' },
  { label: 'Inventário', href: 'inventory', icon: Boxes, group: 'catalogo' },

  // Gestão
  { label: 'Equipe', href: 'members', icon: Users, group: 'gestao' },
  { label: 'Relatórios', href: 'reports', icon: BarChart3, group: 'gestao' },
  { label: 'Configurações', href: 'settings', icon: Settings, group: 'gestao' },
];
