/**
 * ============================================================================
 * StoreDevicesPage — Sub-rota /stores/:storeId/devices
 * ============================================================================
 */

import { StoreDeviceList } from '@/components/store/StoreDeviceList';
import { useStoreContext } from '@/components/store/StoreLayout';

export function StoreDevicesPage() {
  const { franchiseId, storeId } = useStoreContext();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Dispositivos</h2>
        <p className="text-sm text-muted-foreground">
          Tablets kiosk registrados nesta loja — status, localização GPS e conexão ESP32 em tempo real.
        </p>
      </div>
      <StoreDeviceList franchiseId={franchiseId} storeId={storeId} />
    </div>
  );
}
