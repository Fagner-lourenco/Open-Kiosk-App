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
  Tablet,
  // Commercial (CRM)
  Kanban,
  CalendarDays,
  PartyPopper,
  Contact,
  FileText,
  // Finance
  PieChart,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  CreditCard,
  TrendingUp,
  SlidersHorizontal,
} from 'lucide-react';

export interface StoreNavItem {
  label: string;
  href: string; // sub-path relativo a /stores/:storeId
  icon: LucideIcon;
  group: 'overview' | 'operação' | 'catalogo' | 'gestao' | 'comercial' | 'financeiro';
}
// Note: 'gestao' group is intentionally missing the accent for backward compat

export const STORE_NAV_GROUPS: Record<string, string> = {
  overview: 'Visão Geral',
  operação: 'Operação',
  catalogo: 'Catálogo',
  gestao: 'Gestão',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
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
  { label: 'Dispositivos', href: 'devices', icon: Tablet, group: 'gestao' },
  { label: 'Equipe', href: 'members', icon: Users, group: 'gestao' },
  { label: 'Relatórios', href: 'reports', icon: BarChart3, group: 'gestao' },
  { label: 'Configurações', href: 'settings', icon: Settings, group: 'gestao' },

  // Comercial (CRM)
  { label: 'Pipeline', href: 'commercial/pipeline', icon: Kanban, group: 'comercial' },
  { label: 'Agenda', href: 'commercial/calendar', icon: CalendarDays, group: 'comercial' },
  { label: 'Eventos', href: 'commercial/events', icon: PartyPopper, group: 'comercial' },
  { label: 'Clientes', href: 'commercial/customers', icon: Contact, group: 'comercial' },
  { label: 'Propostas', href: 'commercial/quotes', icon: FileText, group: 'comercial' },
  { label: 'Atividades', href: 'commercial/activities', icon: CalendarDays, group: 'comercial' },

  // Financeiro
  { label: 'Visão Geral', href: 'finance/overview', icon: PieChart, group: 'financeiro' },
  { label: 'Contas a Receber', href: 'finance/ar', icon: ArrowDownCircle, group: 'financeiro' },
  { label: 'Contas a Pagar', href: 'finance/ap', icon: ArrowUpCircle, group: 'financeiro' },
  { label: 'Caixa & Bancos', href: 'finance/cash', icon: Wallet, group: 'financeiro' },
  { label: 'Pagamentos', href: 'finance/payments', icon: CreditCard, group: 'financeiro' },
  { label: 'Relatórios', href: 'finance/reports', icon: TrendingUp, group: 'financeiro' },
  { label: 'Configurações', href: 'finance/settings', icon: SlidersHorizontal, group: 'financeiro' },
];
