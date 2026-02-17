/**
 * Coverage tests for admin/src/components/store/ (store tabs & related)
 */
import { describe, it, expect } from 'vitest';

// store/index.ts
import '@/components/store/index';

// Store components
import { ProductForm } from '@/components/store/ProductForm';
import { StoreDetailsTab } from '@/components/store/StoreDetailsTab';
import { StoreHardwareStatus } from '@/components/store/StoreHardwareStatus';
import { StoreInventoryTab } from '@/components/store/StoreInventoryTab';
import { StoreKegsTab } from '@/components/store/StoreKegsTab';
import { StoreLayout } from '@/components/store/StoreLayout';
import { StoreMaintenanceTab } from '@/components/store/StoreMaintenanceTab';
import { StoreMembersTab } from '@/components/store/StoreMembersTab';
import { StoreNavAccordion } from '@/components/store/StoreNavAccordion';
import { StoreOperationsTab } from '@/components/store/StoreOperationsTab';
import { StoreOrdersTab } from '@/components/store/StoreOrdersTab';
import { StoreProductsTab } from '@/components/store/StoreProductsTab';
import { StoreReportsTab } from '@/components/store/StoreReportsTab';
import { StoreSettingsTab } from '@/components/store/StoreSettingsTab';
import { StoreWastageTab } from '@/components/store/StoreWastageTab';
import { VideoUploader } from '@/components/store/VideoUploader';

// store/settings
import { AttractVideoCard } from '@/components/store/settings/AttractVideoCard';

// store/commercial
import { CommercialCalendarTab } from '@/components/store/commercial/CommercialCalendarTab';
import { CommercialCustomersTab } from '@/components/store/commercial/CommercialCustomersTab';
import { CommercialEventsTab } from '@/components/store/commercial/CommercialEventsTab';
import { CommercialPipelineTab } from '@/components/store/commercial/CommercialPipelineTab';
import { CommercialQuotesTab } from '@/components/store/commercial/CommercialQuotesTab';

// store/finance
import { FinanceAPTab } from '@/components/store/finance/FinanceAPTab';
import { FinanceARTab } from '@/components/store/finance/FinanceARTab';
import { FinanceCashTab } from '@/components/store/finance/FinanceCashTab';
import { FinanceOverviewTab } from '@/components/store/finance/FinanceOverviewTab';
import { FinanceReportsTab } from '@/components/store/finance/FinanceReportsTab';
import { FinanceSettingsTab } from '@/components/store/finance/FinanceSettingsTab';

const storeComponents = {
  ProductForm, StoreDetailsTab, StoreHardwareStatus, StoreInventoryTab,
  StoreKegsTab, StoreLayout, StoreMaintenanceTab, StoreMembersTab,
  StoreNavAccordion, StoreOperationsTab, StoreOrdersTab, StoreProductsTab,
  StoreReportsTab, StoreSettingsTab, StoreWastageTab, VideoUploader,
  AttractVideoCard, CommercialCalendarTab, CommercialCustomersTab,
  CommercialEventsTab, CommercialPipelineTab, CommercialQuotesTab,
  FinanceAPTab, FinanceARTab, FinanceCashTab, FinanceOverviewTab,
  FinanceReportsTab, FinanceSettingsTab,
};

describe('components/store — módulos exportam corretamente', () => {
  it.each(Object.entries(storeComponents))('%s é componente válido', (_name, comp) => {
    expect(comp).toBeDefined();
    expect(typeof comp).toBe('function');
  });
});
