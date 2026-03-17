/**
 * ============================================================================
 * StoreDeviceList — Lista em tempo real de dispositivos kiosk da loja
 * ============================================================================
 *
 * Assina a coleção `franchises/{franchiseId}/stores/{storeId}/devices` via
 * onSnapshot e exibe status, localização GPS e infos de cada tablet/kiosk.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Wifi, WifiOff, MapPin, Tablet, Clock, Cpu, Beer, Video } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DeviceCameraDialog } from './DeviceCameraDialog';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface DeviceLocationData {
  lat: number;
  lng: number;
  accuracy: number;
  provider: string;
  updatedAt: number;
}

interface DeviceDoc {
  deviceId: string;
  deviceType?: string;
  isOnline?: boolean;
  lastSeen?: Timestamp;
  appVersion?: string;
  uptime?: number;
  selectedTapId?: number;
  plugpagDeviceId?: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  osVersion?: string;
  location?: DeviceLocationData;
  esp32?: {
    connected?: boolean;
    ip?: string;
    mac?: string;
    firmwareVersion?: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Se lastSeen for mais antigo que 3 minutos, dispositivo é considerado offline */
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h${m > 0 ? ` ${m}min` : ''}`;
}

function toDate(ts: Timestamp | undefined): Date | null {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date((ts as unknown as { seconds: number }).seconds * 1000);
}

/** Deriva status online a partir do lastSeen em vez de confiar no campo isOnline */
function isDeviceOnline(lastSeen: Timestamp | undefined): boolean {
  const d = toDate(lastSeen);
  if (!d) return false;
  return Date.now() - d.getTime() < ONLINE_THRESHOLD_MS;
}

/** Monta um nome descritivo para o dispositivo a partir dos metadados disponíveis */
function buildDeviceLabel(device: DeviceDoc): { primary: string; secondary: string | null } {
  const parts: string[] = [];

  // Tap (torneira)
  if (device.selectedTapId != null) {
    parts.push(`Torneira ${device.selectedTapId}`);
  }

  // Modelo do hardware
  if (device.deviceModel) {
    const model = device.deviceManufacturer
      ? `${device.deviceManufacturer} ${device.deviceModel}`
      : device.deviceModel;
    parts.push(model);
  }

  const primary = parts.length > 0 ? parts.join(' · ') : device.deviceId;
  const secondary = parts.length > 0 ? device.deviceId : null;
  return { primary, secondary };
}

// ─── Componente Principal ────────────────────────────────────────────────────

interface StoreDeviceListProps {
  franchiseId: string;
  storeId: string;
}

export function StoreDeviceList({ franchiseId, storeId }: StoreDeviceListProps) {
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cameraDevice, setCameraDevice] = useState<DeviceDoc | null>(null);

  useEffect(() => {
    if (!franchiseId || !storeId) return;

    const colRef = collection(db, `franchises/${franchiseId}/stores/${storeId}/devices`);
    const unsub = onSnapshot(colRef, (snap) => {
      const docs = snap.docs.map((d) => ({ ...(d.data() as Omit<DeviceDoc, 'deviceId'>), deviceId: d.id }));
      // Ordenar: online (derivado de lastSeen) primeiro, depois por deviceId
      docs.sort((a, b) => {
        const aOn = isDeviceOnline(a.lastSeen) ? 1 : 0;
        const bOn = isDeviceOnline(b.lastSeen) ? 1 : 0;
        if (bOn !== aOn) return bOn - aOn;
        return a.deviceId.localeCompare(b.deviceId);
      });
      setDevices(docs);
      setLoading(false);
    });

    return unsub;
  }, [franchiseId, storeId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Tablet className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum dispositivo registrado</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Os tablets enviam heartbeat automaticamente ao iniciar o app kiosk.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {devices.map((device) => {
        const lastSeenDate = toDate(device.lastSeen);
        const online = isDeviceOnline(device.lastSeen);
        const hasGps = device.location && device.location.lat != null;
        const mapsUrl = hasGps
          ? `https://www.google.com/maps?q=${device.location!.lat},${device.location!.lng}`
          : null;

        const label = buildDeviceLabel(device);

        return (
          <Card key={device.deviceId} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    {device.selectedTapId != null ? (
                      <Beer className="h-4 w-4 shrink-0 text-amber-500" />
                    ) : (
                      <Tablet className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <CardTitle className="truncate text-sm font-medium">
                      {label.primary}
                    </CardTitle>
                  </div>
                  {label.secondary && (
                    <span className="text-[10px] font-mono text-muted-foreground/60 ml-6 truncate">
                      {label.secondary}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCameraDevice(device)}
                    disabled={!online}
                    title={online ? 'Abrir câmera remota' : 'Dispositivo offline'}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                  <Badge
                    variant={online ? 'default' : 'secondary'}
                    className="shrink-0 gap-1 text-[11px]"
                  >
                  {online ? (
                    <><Wifi className="h-3 w-3" /> Online</>
                  ) : (
                    <><WifiOff className="h-3 w-3" /> Offline</>
                  )}
                </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-2 pt-0">
              {/* Row: tipo + versão + uptime */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {device.deviceType && (
                  <span className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    {device.deviceType}
                  </span>
                )}
                {device.appVersion && (
                  <span>v{device.appVersion}</span>
                )}
                {device.plugpagDeviceId && (
                  <span className="font-mono">{device.plugpagDeviceId}</span>
                )}
                {device.uptime != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    uptime {formatUptime(device.uptime)}
                  </span>
                )}
                {lastSeenDate && (
                  <span>
                    visto{' '}
                    {formatDistanceToNow(lastSeenDate, { addSuffix: true, locale: ptBR })}
                  </span>
                )}
              </div>

              {/* GPS */}
              {hasGps && (
                <div className="flex items-center gap-1.5 text-xs">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  <a
                    href={mapsUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-primary hover:underline"
                  >
                    {device.location!.lat.toFixed(6)}, {device.location!.lng.toFixed(6)}
                  </a>
                  <span className="text-muted-foreground/60">
                    ±{Math.round(device.location!.accuracy)}m · {device.location!.provider}
                  </span>
                </div>
              )}

              {!hasGps && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>GPS não disponível</span>
                </div>
              )}

              {/* ESP32 (se conectado) */}
              {device.esp32?.connected && (
                <div className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <span className="font-medium">ESP32</span>
                  {device.esp32.ip && <> · IP {device.esp32.ip}</>}
                  {device.esp32.mac && <> · MAC {device.esp32.mac}</>}
                  {device.esp32.firmwareVersion && <> · fw {device.esp32.firmwareVersion}</>}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Dialog de câmera remota */}
      {cameraDevice && (
        <DeviceCameraDialog
          open={!!cameraDevice}
          onOpenChange={(open) => { if (!open) setCameraDevice(null); }}
          franchiseId={franchiseId}
          storeId={storeId}
          deviceId={cameraDevice.deviceId}
          deviceLabel={buildDeviceLabel(cameraDevice).primary}
        />
      )}
    </div>
  );
}
