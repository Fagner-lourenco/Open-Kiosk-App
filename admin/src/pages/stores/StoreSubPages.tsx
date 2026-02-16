/**
 * ============================================================================
 * Store Sub-Route Wrappers
 * ============================================================================
 *
 * Thin wrapper pages that bridge StoreLayout outlet context
 * to existing Store*Tab components (which expect franchiseId+storeId props).
 */

import {
  StoreProductsTab,
  StoreInventoryTab,
  StoreOrdersTab,
  StoreReportsTab,
  StoreSettingsTab,
  StoreMembersTab,
  StoreKegsTab,
  StoreOperationsTab,
  StoreWastageTab,
  StoreMaintenanceTab,
  // Commercial (CRM)
  CommercialPipelineTab,
  CommercialCalendarTab,
  CommercialEventsTab,
  CommercialCustomersTab,
  CommercialQuotesTab,
  // Finance
  FinanceOverviewTab,
  FinanceARTab,
  FinanceAPTab,
  FinanceCashTab,
  FinanceReportsTab,
  FinanceSettingsTab,
} from '@/components/store';
import { useStoreContext } from '@/components/store/StoreLayout';

// ─── Operação ───────────────────────────────────────────────────────────────

export function StoreOrdersPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreOrdersTab franchiseId={franchiseId} storeId={storeId} />;
}

export function StoreOperationsPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreOperationsTab franchiseId={franchiseId} storeId={storeId} />;
}

export function StoreKegsPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreKegsTab franchiseId={franchiseId} storeId={storeId} />;
}

export function StoreWastagePage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreWastageTab franchiseId={franchiseId} storeId={storeId} />;
}

export function StoreMaintenancePage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreMaintenanceTab franchiseId={franchiseId} storeId={storeId} />;
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

export function StoreProductsPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreProductsTab franchiseId={franchiseId} storeId={storeId} />;
}

export function StoreInventoryPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreInventoryTab franchiseId={franchiseId} storeId={storeId} />;
}

// ─── Gestão ─────────────────────────────────────────────────────────────────

export function StoreMembersPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreMembersTab franchiseId={franchiseId} storeId={storeId} />;
}

export function StoreReportsPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreReportsTab franchiseId={franchiseId} storeId={storeId} />;
}

export function StoreSettingsPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreSettingsTab franchiseId={franchiseId} storeId={storeId} />;
}

// ─── Comercial (CRM) ───────────────────────────────────────────────────────

export function CommercialPipelinePage() {
  const { franchiseId, storeId } = useStoreContext();
  return <CommercialPipelineTab franchiseId={franchiseId} storeId={storeId} />;
}

export function CommercialCalendarPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <CommercialCalendarTab franchiseId={franchiseId} storeId={storeId} />;
}

export function CommercialEventsPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <CommercialEventsTab franchiseId={franchiseId} storeId={storeId} />;
}

export function CommercialCustomersPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <CommercialCustomersTab franchiseId={franchiseId} storeId={storeId} />;
}

export function CommercialQuotesPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <CommercialQuotesTab franchiseId={franchiseId} storeId={storeId} />;
}

// ─── Financeiro ─────────────────────────────────────────────────────────────

export function FinanceOverviewPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <FinanceOverviewTab franchiseId={franchiseId} storeId={storeId} />;
}

export function FinanceARPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <FinanceARTab franchiseId={franchiseId} storeId={storeId} />;
}

export function FinanceAPPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <FinanceAPTab franchiseId={franchiseId} storeId={storeId} />;
}

export function FinanceCashPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <FinanceCashTab franchiseId={franchiseId} storeId={storeId} />;
}

export function FinanceReportsPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <FinanceReportsTab franchiseId={franchiseId} storeId={storeId} />;
}

export function FinanceSettingsPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <FinanceSettingsTab franchiseId={franchiseId} storeId={storeId} />;
}
