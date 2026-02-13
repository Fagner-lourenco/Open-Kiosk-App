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
} from '@/components/store';
import { useStoreContext } from '@/components/store/StoreLayout';

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

export function StoreProductsPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreProductsTab franchiseId={franchiseId} storeId={storeId} />;
}

export function StoreInventoryPage() {
  const { franchiseId, storeId } = useStoreContext();
  return <StoreInventoryTab franchiseId={franchiseId} storeId={storeId} />;
}

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
