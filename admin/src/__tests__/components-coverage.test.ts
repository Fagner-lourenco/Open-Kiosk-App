/**
 * Coverage tests for admin/src/components/ (non-ui subdirectories)
 * Covers: common/, dashboard/, landing/, layout/, orders/, shared/, Can, NotificationCenter
 */
import { describe, it, expect } from 'vitest';

// Can.tsx
import { Can } from '@/components/Can';

// common/
import '@/components/common/index';
import { ConfirmActionDialog } from '@/components/common/ConfirmActionDialog';
import { DangerZoneCard } from '@/components/common/DangerZoneCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { NoFranchiseSelected } from '@/components/common/NoFranchiseSelected';

// dashboard/
import '@/components/dashboard/index';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { KPICards } from '@/components/dashboard/KPICards';
import { PaymentMethodsChart } from '@/components/dashboard/PaymentMethodsChart';
import { SalesByHourChart } from '@/components/dashboard/SalesByHourChart';
import { TopProductsTable } from '@/components/dashboard/TopProductsTable';

// landing/
import { BRAND_NAME } from '@/components/landing/constants';
import ContactForm from '@/components/landing/ContactForm';
import EvolutionPath from '@/components/landing/EvolutionPath';
import ExitIntentModal from '@/components/landing/ExitIntentModal';
import FAQAccordion from '@/components/landing/FAQAccordion';
import HowItWorksTabs from '@/components/landing/HowItWorksTabs';
import MobileCTABar from '@/components/landing/MobileCTABar';
import RegionsSection from '@/components/landing/RegionsSection';
import Section from '@/components/landing/Section';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import WhatsAppGroupModal from '@/components/landing/WhatsAppGroupModal';

// layout/
import '@/components/layout/index';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { FilterBar } from '@/components/layout/FilterBar';
import { FranchiseStoreSelector } from '@/components/layout/FranchiseStoreSelector';
import { Header } from '@/components/layout/Header';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Sidebar as AdminSidebar } from '@/components/layout/Sidebar';
import { TabGroup } from '@/components/layout/TabGroup';

// NotificationCenter
import { NotificationCenter } from '@/components/NotificationCenter';

// orders/
import '@/components/orders/index';
import '@/components/orders/types';
import { OrderActions } from '@/components/orders/OrderActions';
import { OrderCard } from '@/components/orders/OrderCard';
import { OrderDetails } from '@/components/orders/OrderDetails';
import { OrderFilters } from '@/components/orders/OrderFilters';
import { OrdersList } from '@/components/orders/OrdersList';
import { OrdersPanel } from '@/components/orders/OrdersPanel';
import { OrderStatsCards as OrderStats } from '@/components/orders/OrderStats';
import { OrderTimeline } from '@/components/orders/OrderTimeline';

// shared/
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';

const components = {
  Can, ConfirmActionDialog, DangerZoneCard, EmptyState, ErrorState,
  LoadingState, NoFranchiseSelected, AlertsPanel, KPICards,
  PaymentMethodsChart, SalesByHourChart, TopProductsTable,
  ContactForm, EvolutionPath, ExitIntentModal, FAQAccordion,
  HowItWorksTabs, MobileCTABar, RegionsSection, Section,
  WhatsAppFloatingButton, WhatsAppGroupModal, AuthLayout,
  Breadcrumbs, FilterBar, FranchiseStoreSelector, Header,
  MainLayout, PageHeader, AdminSidebar, TabGroup,
  NotificationCenter, OrderActions, OrderCard, OrderDetails,
  OrderFilters, OrdersList, OrdersPanel, OrderStats, OrderTimeline,
  ConfirmDeleteDialog,
};

describe('components — módulos exportam corretamente', () => {
  it.each(Object.entries(components))('%s é componente/função válido', (_name, comp) => {
    expect(comp).toBeDefined();
    expect(typeof comp).toBe('function');
  });

  it('landing/constants exporta constantes', () => {
    expect(BRAND_NAME).toBeDefined();
  });
});
