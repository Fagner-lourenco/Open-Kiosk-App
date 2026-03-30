/**
 * ============================================================================
 * Store Settings Tab Component
 * ============================================================================
 * 
 * Componente para configurações de uma loja específica.
 * Permite editar configurações com persistência no Firestore.
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, updateDoc, onSnapshot, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Loader2, Save, CreditCard, Bell, Cpu, Wifi, WifiOff, AlertTriangle, Trash2, Droplets, Printer, Plus, X, Activity, Video, CheckCircle, XCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { usePermissions } from '@/hooks/usePermissions';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';
import { normalizeProvider } from '@/utils/paymentNormalizer';
import { toDualWritePayload } from '../../../../shared/utils/settingsNormalizer';
import type { AttractVideoConfig } from '../../../../shared/types/store';
import type { PaymentGatewayConfig, PaymentProvider, PaymentEnvironment, EnabledPaymentMethods } from '@/types/store';
import { getAvailableGateways, getGatewayById, getGatewayStatusBadge } from '@shared/config/gateways';
import { AttractVideoCard } from './settings/AttractVideoCard';

// Interface para status de hardware em tempo real (do Firestore)
interface HardwareStatus {
  esp32?: {
    isConnected: boolean;
    lastSeen: Date;
    firmwareVersion?: string;
    macAddress?: string;
    ipAddress?: string;
    lastError?: string;
  };
  dispensers?: Array<{
    id: number;
    name?: string;
    productId?: string;
    productName?: string;
    status: 'ready' | 'busy' | 'error' | 'offline';
    lastDispense?: Date;
    totalDispenses?: number;
    flowRate?: number;
  }>;
  printer?: {
    isConnected: boolean;
    model?: string;
    lastPrint?: Date;
    paperStatus?: 'ok' | 'low' | 'empty';
  };
  lastHeartbeat?: Date;
  updatedAt?: Date;
}

type ConnectionState = 'unconfigured' | 'connecting' | 'online' | 'offline' | 'error';
type ConnectionType = 'none' | 'usb' | 'ble' | 'wifi';

interface DeviceStatus {
  state: ConnectionState;
  type: ConnectionType;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  lastErrorAt: Date | null;
  firmwareVersion: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  message: string;
  lastError?: string;
}

function getMinutesAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 60000);
}

// Aceita formato nested (admin) e flat (kiosk) para evitar regressao
function mapFirestoreToDeviceStatus(data: Record<string, any> | null): DeviceStatus {
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return {
      state: 'unconfigured',
      type: 'none',
      lastSeenAt: null,
      lastSyncAt: null,
      lastErrorAt: null,
      firmwareVersion: null,
      macAddress: null,
      ipAddress: null,
      message: 'Dispositivo não configurado. Escaneie QR ou conecte USB.'
    };
  }

  const isConnected = data.isConnected ?? data.esp32Connected ?? false;
  const connectionType = data.type ?? data.esp32Type ?? 'wifi';
  const ipAddress = data.ipAddress ?? data.esp32Ip ?? null;
  const lastSeenRaw = data.lastSeenAt ?? data.lastSeen ?? data.lastHeartbeat ?? null;
  const lastSeen = lastSeenRaw instanceof Date ? lastSeenRaw : (lastSeenRaw?.toDate?.() ?? null);
  const lastError = data.lastError ?? null;

  const hasSignal = Boolean(
    isConnected ||
    lastSeen ||
    data.firmwareVersion ||
    data.macAddress ||
    ipAddress ||
    lastError
  );

  if (!hasSignal) {
    return {
      state: 'unconfigured',
      type: 'none',
      lastSeenAt: null,
      lastSyncAt: null,
      lastErrorAt: null,
      firmwareVersion: null,
      macAddress: null,
      ipAddress: null,
      message: 'Dispositivo não configurado. Escaneie QR ou conecte USB.'
    };
  }

  if (isConnected === true) {
    return {
      state: 'online',
      type: (connectionType as ConnectionType) || 'wifi',
      lastSeenAt: lastSeen,
      lastSyncAt: new Date(),
      lastErrorAt: null,
      firmwareVersion: data.firmwareVersion ?? null,
      macAddress: data.macAddress ?? null,
      ipAddress,
      message: `Online \u2022 ${String(connectionType).toUpperCase()}`,
      lastError: lastError ?? undefined
    };
  }

  if (lastSeen instanceof Date && lastSeen < new Date(Date.now() - 60_000)) {
    return {
      state: 'offline',
      type: (connectionType as ConnectionType) || 'wifi',
      lastSeenAt: lastSeen,
      lastSyncAt: new Date(),
      lastErrorAt: lastError && new Date(),
      firmwareVersion: data.firmwareVersion ?? null,
      macAddress: data.macAddress ?? null,
      ipAddress,
      message: `Offline (último visto há ${getMinutesAgo(lastSeen)}min)`,
      lastError: lastError ?? undefined
    };
  }

  return {
    state: 'connecting',
    type: (connectionType as ConnectionType) || 'wifi',
    lastSeenAt: lastSeen,
    lastSyncAt: new Date(),
    lastErrorAt: null,
    firmwareVersion: null,
    macAddress: null,
    ipAddress: null,
    message: 'Conectando...',
    lastError: lastError ?? undefined
  };
}

// ============================================================================
// TAP CONFIG (CANONICAL)
// ============================================================================

/**
 * Canonical TapConfig — the format persisted as taps[] in Firestore.
 * Admin UI edits this directly. No more DispenserConfig intermediate format.
 */
interface TapConfigLocal {
  id: number;
  name: string;
  enabled: boolean;
  valvePin?: number;
  sensorPin?: number;
  calibration?: {
    pulsesPerLiter?: number;
    mlPerSecond?: number;
  };
  productId?: string;
  productName?: string;
  /** Identificador do terminal PlugPag vinculado (ex: "PRO-1733203195" ou MAC legado) */
  plugpagDeviceId?: string;
  /** Terminal MP Point vinculado a esta torneira (ex: "GERTEC_MP35P__12345") */
  mpTerminalId?: string;
  /** External POS ID do MP QR vinculado a esta torneira (ex: "KIOSK-TAP-1") */
  mpExternalPosId?: string;
}

// ============================================================================
// XIAO ESP32-S3 BOARD PROFILE
// ============================================================================

/**
 * Available GPIO pins on Seeed Studio XIAO ESP32-S3 header.
 * This is the SINGLE source of truth for the pin dropdown.
 */
const XIAO_GPIO_OPTIONS: { gpio: number; label: string }[] = [
  { gpio: 1,  label: 'D0 (GPIO1)' },
  { gpio: 2,  label: 'D1 (GPIO2)' },
  { gpio: 3,  label: 'D2 (GPIO3)' },
  { gpio: 4,  label: 'D3 (GPIO4)' },
  { gpio: 5,  label: 'D4 (GPIO5)' },
  { gpio: 6,  label: 'D5 (GPIO6)' },
  { gpio: 7,  label: 'D8 (GPIO7)' },
  { gpio: 8,  label: 'D9 (GPIO8)' },
  { gpio: 9,  label: 'D10 (GPIO9)' },
  { gpio: 12, label: 'D11 (GPIO12)' },
  { gpio: 13, label: 'D12 (GPIO13)' },
];

/** UART pins — selectable only in advanced mode with explicit warning */
const XIAO_UART_OPTIONS: { gpio: number; label: string }[] = [
  { gpio: 43, label: 'D6/TX (GPIO43) ⚠️' },
  { gpio: 44, label: 'D7/RX (GPIO44) ⚠️' },
];

const ALLOWED_PINS = new Set(XIAO_GPIO_OPTIONS.map(o => o.gpio));
const UART_PINS = new Set(XIAO_UART_OPTIONS.map(o => o.gpio));

// ============================================================================
// GPIO VALIDATION HELPERS
// ============================================================================

function validateGpioPin(
  pin: number | undefined,
  _isValve: boolean,
  advancedMode: boolean,
): { valid: boolean; warning?: string } {
  if (pin === undefined || pin === null) return { valid: true };
  if (!Number.isInteger(pin)) {
    return { valid: false, warning: 'GPIO deve ser número inteiro' };
  }
  if (UART_PINS.has(pin)) {
    if (!advancedMode) {
      return { valid: false, warning: `GPIO ${pin} é TX/RX Serial — habilite "Modo Avançado" para usar` };
    }
    return { valid: true, warning: `GPIO ${pin} é TX/RX Serial — pode causar ativação indesejada da válvula quando idle!` };
  }
  if (!ALLOWED_PINS.has(pin) && !UART_PINS.has(pin)) {
    return { valid: false, warning: `GPIO ${pin} não está disponível no XIAO ESP32-S3` };
  }
  return { valid: true };
}

function findDuplicateGpioPins(taps: TapConfigLocal[]): Map<number, string[]> {
  const usage = new Map<number, string[]>();
  taps.forEach((t) => {
    if (t.valvePin !== undefined && t.valvePin !== null) {
      const list = usage.get(t.valvePin) || [];
      list.push(`T${t.id} Válvula`);
      usage.set(t.valvePin, list);
    }
    if (t.sensorPin !== undefined && t.sensorPin !== null) {
      const list = usage.get(t.sensorPin) || [];
      list.push(`T${t.id} Sensor`);
      usage.set(t.sensorPin, list);
    }
  });
  const dupes = new Map<number, string[]>();
  usage.forEach((users, pin) => { if (users.length > 1) dupes.set(pin, users); });
  return dupes;
}

/**
 * Backward-compat: Convert canonical taps[] → legacy dispensers[] for dual-write.
 * Maps pulsesPerLiter → mlPerPulse (1000/pulsesPerLiter).
 */
function convertTapsToDispensers(taps: TapConfigLocal[]): any[] {
  return taps.map(t => ({
    id: t.id,
    name: t.name,
    enabled: t.enabled,
    valvePin: t.valvePin,
    sensorPin: t.sensorPin,
    calibration: {
      mlPerPulse: t.calibration?.pulsesPerLiter && t.calibration.pulsesPerLiter > 0
        ? parseFloat((1000 / t.calibration.pulsesPerLiter).toFixed(3))
        : 1.0,
      flowTimeout: 30,
    },
    productId: t.productId,
  }));
}

/**
 * Convert legacy dispensers[] → canonical taps[] on load.
 */
function convertDispensersToTaps(dispensers: any[]): TapConfigLocal[] {
  return dispensers.map(d => ({
    id: d.id,
    name: d.name,
    enabled: d.enabled ?? true,
    valvePin: d.valvePin,
    sensorPin: d.sensorPin,
    calibration: {
      pulsesPerLiter: d.calibration?.mlPerPulse && d.calibration.mlPerPulse > 0
        ? Math.round(1000 / d.calibration.mlPerPulse)
        : d.calibration?.pulsesPerLiter,
      mlPerSecond: d.calibration?.mlPerSecond,
    },
    productId: d.productId,
    productName: d.productName,
  }));
}

interface StoreSettings {
  // General
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  
  // Tax/Fiscal
  taxId?: string;
  taxPercentage?: number;
  
  // Operation
  currency: string;
  timezone: string;
  language: string;
  
  // Payment Gateway (canônico)
  paymentGatewayConfig?: PaymentGatewayConfig;
  
  // ESP32 / Hardware
  esp32?: {
    isConnected?: boolean;
    lastSeen?: Date;
    firmwareVersion?: string;
    macAddress?: string;
    lastError?: string;
  };

  // Multi-Tap versioning
  tapsUpdatedAt?: Date | string | number;
  tapsVersion?: string | number;

  // Canonical Taps Configuration (source of truth)
  taps?: TapConfigLocal[];
  maxTaps?: number; // Máximo de torneiras (default 4)

  // Legacy dispensers (load-only, kept for backward compat)
  dispensers?: any[];
  
  // Notifications
  orderNotifications?: boolean;
  lowStockAlerts?: boolean;
  lowStockThreshold?: number;
  
  // Kiosk (canonical names)
  kioskEnabled?: boolean;
  attractScreenEnabled?: boolean;
  attractTimeoutSeconds?: number;
  attractVideoConfig?: AttractVideoConfig;
}

interface StoreSettingsTabProps {
  franchiseId: string;
  storeId: string;
}

const DEFAULT_ENABLED_METHODS: EnabledPaymentMethods = {
  cash: true,
  pix: true,
  credit: true,
  debit: true,
};

// normalizeProvider importado de @/utils/paymentNormalizer

const normalizePaymentGatewayConfig = (data?: Partial<StoreSettings> | null): PaymentGatewayConfig => {
  const legacy = (data as unknown as Record<string, any>) || {};
  const legacyGateway = legacy.paymentGateway || {};
  const current = data?.paymentGatewayConfig;
  const provider = normalizeProvider(current?.provider || legacyGateway.provider);
  const environment: PaymentEnvironment = current?.environment || legacyGateway.environment || legacyGateway.mode || 'sandbox';

  const enabledMethods: EnabledPaymentMethods = {
    cash: current?.enabledMethods?.cash ?? legacy.acceptCash ?? DEFAULT_ENABLED_METHODS.cash,
    pix: current?.enabledMethods?.pix ?? legacy.acceptPix ?? DEFAULT_ENABLED_METHODS.pix,
    credit: current?.enabledMethods?.credit ?? legacy.acceptCard ?? DEFAULT_ENABLED_METHODS.credit,
    debit: current?.enabledMethods?.debit ?? legacyGateway?.enabledMethods?.debit ?? DEFAULT_ENABLED_METHODS.debit,
  };

  const pixKey = current?.pixKey ?? legacy.pixKey;

  return {
    provider,
    environment,
    enabledMethods,
    pixKey,
    providers: {
      pagbank: {
        ...(current?.providers?.pagbank || {}),
        // clientId and merchantId removed — dead fields never used by PagBank API
        publicKey: current?.providers?.pagbank?.publicKey || legacyGateway?.publicKey,
      },
      mercadopago: {
        ...(current?.providers?.mercadopago || {}),
        userId: current?.providers?.mercadopago?.userId || legacyGateway?.userId,
        storeId: current?.providers?.mercadopago?.storeId || legacyGateway?.storeId,
        externalPosId: current?.providers?.mercadopago?.externalPosId || legacyGateway?.externalPosId,
        terminalId: current?.providers?.mercadopago?.terminalId || legacyGateway?.terminalId,
      },
    },
    configuredAt: current?.configuredAt || legacyGateway?.configuredAt,
    lastValidatedAt: current?.lastValidatedAt || legacyGateway?.lastValidatedAt,
    lastValidationResult: current?.lastValidationResult || legacyGateway?.lastValidationResult,
  };
};

const sanitizePaymentGatewayConfigForSave = (config: PaymentGatewayConfig): PaymentGatewayConfig => {
  const sanitized = sanitizeFirestoreData(config) as PaymentGatewayConfig;
  // Remove segredos e campos legados do payload de escrita
  delete (sanitized as any).accessToken;
  delete (sanitized as any).mode;
  delete (sanitized as any).userId;
  delete (sanitized as any).storeId;
  delete (sanitized as any).externalPosId;
  delete (sanitized as any).terminalId;
  // Clean dead PagBank fields
  if (sanitized.providers?.pagbank) {
    delete (sanitized.providers.pagbank as any).clientId;
    delete (sanitized.providers.pagbank as any).merchantId;
  }
  return sanitized;
};

const validatePaymentGatewayConfig = (config: PaymentGatewayConfig): string[] => {
  const errors: string[] = [];

  if (config.provider === 'pagbank') {
    const publicKey = config.providers?.pagbank?.publicKey;
    const plugpagEnabled = (config.providers?.pagbank as any)?.plugpag?.enabled;
    const needsCard = config.enabledMethods?.credit || config.enabledMethods?.debit;

    // publicKey is only needed for online card payments (PagBank.js SDK).
    // PlugPag terminal payments are processed locally and don't need it.
    if (needsCard && !publicKey && !plugpagEnabled) {
      errors.push('PagBank: Public Key é obrigatório para cartão online (não necessário com maquininha).');
    }
    // clientId is NOT required — PagBank API uses Bearer token auth (authToken in functions/.env)
    // merchantId is informational only — never sent to PagBank API
  }

  return errors;
};

export function StoreSettingsTab({ franchiseId, storeId }: StoreSettingsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { log: audit } = useAudit();
  const { can } = usePermissions();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Estado para hardware em tempo real
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus | null>(null);
  const [hardwareLoading, setHardwareLoading] = useState(true);

  const deviceStatusSource = useMemo(() => {
    const esp32 = hardwareStatus?.esp32;
    const fallback = settings?.esp32;
    const merged = {
      isConnected: esp32?.isConnected ?? fallback?.isConnected ?? false,
      lastSeen: esp32?.lastSeen ?? fallback?.lastSeen ?? hardwareStatus?.lastHeartbeat ?? null,
      firmwareVersion: esp32?.firmwareVersion ?? fallback?.firmwareVersion ?? null,
      macAddress: esp32?.macAddress ?? fallback?.macAddress ?? null,
      ipAddress: esp32?.ipAddress ?? null,
      lastError: esp32?.lastError ?? fallback?.lastError ?? null,
      esp32Connected: esp32?.isConnected,
      esp32Ip: esp32?.ipAddress,
    };

    const hasData = Boolean(
      merged.isConnected ||
      merged.lastSeen ||
      merged.firmwareVersion ||
      merged.macAddress ||
      merged.ipAddress ||
      merged.lastError
    );

    return hasData ? merged : null;
  }, [hardwareStatus?.esp32, hardwareStatus?.lastHeartbeat, settings?.esp32]);

  const deviceStatus = useMemo<DeviceStatus>(
    () => mapFirestoreToDeviceStatus(deviceStatusSource),
    [deviceStatusSource]
  );

  // Listener em tempo real para status de hardware
  useEffect(() => {
    const hardwareRef = doc(db, 'franchises', franchiseId, 'stores', storeId, 'hardware', 'status');
    
    const unsubscribe = onSnapshot(hardwareRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        // Mapear campos flat do Kiosk para estrutura esperada pelo Admin
        // O Kiosk salva: esp32Connected, esp32Ip, macAddress, firmwareVersion
        // O Admin espera: esp32.isConnected, esp32.ipAddress, esp32.macAddress, esp32.firmwareVersion
        setHardwareStatus({
          esp32: {
            isConnected: data.esp32Connected ?? data.esp32?.isConnected ?? false,
            lastSeen: data.lastHeartbeat?.toDate?.() || data.esp32?.lastSeen?.toDate?.() || data.lastHeartbeat,
            firmwareVersion: data.firmwareVersion || data.esp32?.firmwareVersion,
            macAddress: data.macAddress || data.esp32?.macAddress,
            ipAddress: data.esp32Ip || data.esp32?.ipAddress,
            lastError: data.lastError || data.esp32?.lastError,
          },
          dispensers: data.dispensers?.map((d: Record<string, unknown>) => ({
            ...d,
            lastDispense: d.lastDispense && typeof d.lastDispense === 'object' && 'toDate' in d.lastDispense 
              ? (d.lastDispense as { toDate: () => Date }).toDate() 
              : d.lastDispense,
          })),
          printer: data.printer ? {
            ...data.printer,
            lastPrint: data.printer.lastPrint?.toDate?.() || data.printer.lastPrint,
          } : data.printerConnected ? {
            isConnected: data.printerConnected,
            model: data.printerPort,
          } : undefined,
          lastHeartbeat: data.lastHeartbeat?.toDate?.() || data.lastHeartbeat,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        } as HardwareStatus);
      } else {
        setHardwareStatus(null);
      }
      setHardwareLoading(false);
    }, (error) => {
      console.error('Error listening to hardware status:', error);
      setHardwareLoading(false);
    });

    return () => unsubscribe();
  }, [franchiseId, storeId]);

  // Fetch store settings
  const { data: storeData, isLoading } = useQuery({
    queryKey: ['store-settings', franchiseId, storeId],
    queryFn: async () => {
      const storeRef = doc(db, 'franchises', franchiseId, 'stores', storeId);
      const snapshot = await getDoc(storeRef);
      if (!snapshot.exists()) throw new Error('Loja não encontrada');
      return snapshot.data() as StoreSettings;
    },
  });

  // Initialize settings state when data loads
  useEffect(() => {
    if (storeData) {
      const normalizedConfig = normalizePaymentGatewayConfig(storeData);

      // Load taps from canonical taps[] first, fallback to legacy dispensers[]
      let loadedTaps: TapConfigLocal[] = [];
      if (Array.isArray((storeData as any).taps) && (storeData as any).taps.length > 0) {
        loadedTaps = (storeData as any).taps.map((t: any) => ({
          id: t.id,
          name: t.name,
          enabled: t.enabled ?? true,
          valvePin: t.valvePin,
          sensorPin: t.sensorPin,
          calibration: {
            pulsesPerLiter: t.calibration?.pulsesPerLiter,
            mlPerSecond: t.calibration?.mlPerSecond,
          },
          productId: t.productId,
          productName: t.productName,
          plugpagDeviceId: t.plugpagDeviceId,
          mpTerminalId: t.mpTerminalId,
          mpExternalPosId: t.mpExternalPosId,
        }));
      } else if (Array.isArray(storeData.dispensers) && storeData.dispensers.length > 0) {
        loadedTaps = convertDispensersToTaps(storeData.dispensers);
      }

      setSettings({
        ...storeData,
        // Normalize legacy field names on load
        kioskEnabled: storeData.kioskEnabled ?? false,
        attractTimeoutSeconds: storeData.attractTimeoutSeconds ?? 60,
        language: storeData.language || 'pt-BR',
        paymentGatewayConfig: normalizedConfig,
        taps: loadedTaps,
        // Convert Firestore Timestamp → Date JS to avoid "Invalid Date"
        tapsUpdatedAt: storeData.tapsUpdatedAt && typeof (storeData.tapsUpdatedAt as any).toDate === 'function'
          ? (storeData.tapsUpdatedAt as any).toDate()
          : storeData.tapsUpdatedAt,
      });
    }
  }, [storeData]);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<StoreSettings>) => {
      const storeRef = doc(db, 'franchises', franchiseId, 'stores', storeId);
        const sanitizedSettings = sanitizeFirestoreData(newSettings) as typeof newSettings;
        const legacy = sanitizedSettings as unknown as Record<string, unknown>;
        // Remove legacy fields to evitar duplicação
        delete legacy.acceptCash;
        delete legacy.acceptCard;
        delete legacy.acceptPix;
        delete legacy.pixKey;
        delete legacy.paymentGateway;
        // Remove UI-only fields that should not be persisted
        delete legacy.__gpioAdvancedMode;
        // Remove read-only fields that should not be overwritten
        delete legacy.esp32;

        const paymentGatewayConfig = sanitizePaymentGatewayConfigForSave(
          (sanitizedSettings.paymentGatewayConfig || normalizePaymentGatewayConfig(sanitizedSettings)) as PaymentGatewayConfig
        );

        // Dual-write kiosk settings: canonical + legacy for backward compat
        const dualWrite = toDualWritePayload({
          kioskEnabled: sanitizedSettings.kioskEnabled,
          attractTimeoutSeconds: sanitizedSettings.attractTimeoutSeconds,
          attractScreenEnabled: sanitizedSettings.attractScreenEnabled,
          language: sanitizedSettings.language as 'en' | 'pt-BR' | undefined,
          attractVideoConfig: sanitizedSettings.attractVideoConfig,
        });

        // CANONICAL: Write taps[] directly + dual-write dispensers[] for backward compat
        const tapsPayload: Record<string, unknown> = {};
        if (sanitizedSettings.taps && sanitizedSettings.taps.length > 0) {
          tapsPayload.taps = sanitizedSettings.taps.map(t => ({
            id: t.id,
            name: t.name,
            enabled: t.enabled,
            valvePin: t.valvePin,
            sensorPin: t.sensorPin,
            calibration: t.calibration ? {
              pulsesPerLiter: t.calibration.pulsesPerLiter,
              mlPerSecond: t.calibration.mlPerSecond,
            } : undefined,
            productId: t.productId,
            productName: t.productName,
            plugpagDeviceId: t.plugpagDeviceId,
            mpTerminalId: t.mpTerminalId,
            mpExternalPosId: t.mpExternalPosId,
          }));
          // [FIX BUG-GES-06] Usar increment atômico em vez de valor stale do cache
          tapsPayload.tapsVersion = increment(1);
          tapsPayload.tapsUpdatedAt = new Date();
          // Backward compat: dual-write dispensers[] for old Kiosk versions
          tapsPayload.dispensers = convertTapsToDispensers(sanitizedSettings.taps);
        } else if (sanitizedSettings.taps && sanitizedSettings.taps.length === 0) {
          tapsPayload.taps = [];
          tapsPayload.dispensers = [];
          tapsPayload.tapsVersion = increment(1);
          tapsPayload.tapsUpdatedAt = new Date();
        }

        await updateDoc(storeRef, {
          ...sanitizedSettings,
          ...dualWrite,
          ...tapsPayload,
          paymentGatewayConfig,
          updatedAt: new Date(),
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings', franchiseId, storeId] });
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Configurações salvas com sucesso');
      audit(AuditActions.STORE_SETTINGS_UPDATE, { type: 'store', id: storeId, name: settings?.name || storeId }, { updatedFields: Object.keys(settings || {}) });
      setHasChanges(false);
    },
    onError: () => {
      toast.error('Não foi possível salvar as configurações');
    },
  });

  const handleChange = (field: keyof StoreSettings, value: unknown) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
    setHasChanges(true);
  };

  const handleSave = () => {
    if (settings) {
      if (settings.paymentGatewayConfig) {
        const paymentErrors = validatePaymentGatewayConfig(settings.paymentGatewayConfig);
        if (paymentErrors.length > 0) {
          paymentErrors.forEach((error) => toast.error(error));
          return;
        }
      }
      updateSettingsMutation.mutate(settings);
    }
  };

  type PaymentGatewayConfigUpdate = Omit<Partial<PaymentGatewayConfig>, 'enabledMethods' | 'providers'> & {
    enabledMethods?: Partial<EnabledPaymentMethods>;
    providers?: Record<string, Record<string, unknown>>;
  };

  const updatePaymentGatewayConfig = (partial: PaymentGatewayConfigUpdate) => {
    if (!settings) return;
    const current = settings.paymentGatewayConfig || normalizePaymentGatewayConfig(settings);

    // Deep-merge recursivo para suportar chaves aninhadas (ex: plugpag.enabled + plugpag.activationCode)
    const deepMerge = (target: Record<string, any>, source: Record<string, any>): Record<string, any> => {
      const result = { ...target };
      for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
          result[key] = deepMerge(target[key], value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    const mergedProviders: Record<string, Record<string, unknown>> = {
      ...(current.providers as Record<string, Record<string, unknown>> || {}),
    };
    if (partial.providers) {
      for (const [key, value] of Object.entries(partial.providers)) {
        mergedProviders[key] = deepMerge((mergedProviders[key] || {}) as Record<string, any>, value as Record<string, any>);
      }
    }

    const next: PaymentGatewayConfig = {
      ...current,
      ...partial,
      enabledMethods: {
        ...current.enabledMethods,
        ...(partial.enabledMethods || {}),
      },
      providers: mergedProviders as PaymentGatewayConfig['providers'],
    };
    handleChange('paymentGatewayConfig', next);
  };

  const [showClearGatewayDialog, setShowClearGatewayDialog] = useState(false);

  const handleClearGatewayConfig = () => {
    if (!settings) return;
    handleChange('paymentGatewayConfig', {
      provider: 'none',
      environment: 'sandbox',
      enabledMethods: { ...DEFAULT_ENABLED_METHODS },
    } as PaymentGatewayConfig);
    setShowClearGatewayDialog(false);
    toast.success('Configuração do gateway limpa');
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const gatewayConfig = settings.paymentGatewayConfig || normalizePaymentGatewayConfig(settings);

  return (
    <div className="space-y-6">
      {/* Save Button */}
      {hasChanges && (
        <div className="sticky top-0 z-10 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-yellow-800 text-sm">
            Você tem alterações não salvas
          </p>
          <Button onClick={handleSave} disabled={updateSettingsMutation.isPending || !can('settings:update')}>
            {updateSettingsMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Alterações
          </Button>
        </div>
      )}

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Informações Gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nome da Loja</Label>
              <Input
                value={settings.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Nome da loja"
              />
            </div>
            <div>
              <Label>CNPJ / Inscrição Fiscal</Label>
              <Input
                value={settings.taxId || ''}
                onChange={(e) => handleChange('taxId', e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={settings.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="email@loja.com"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={settings.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <Label>Endereço</Label>
              <Input
                value={settings.address || ''}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Endereço da loja"
              />
            </div>
            <div>
              <Label>Taxa de Imposto (%)</Label>
              <Input
                type="number"
                value={settings.taxPercentage || 0}
                onChange={(e) => handleChange('taxPercentage', parseFloat(e.target.value) || 0)}
                placeholder="18"
              />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={settings.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Descrição da loja..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Operation Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações de Operação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Moeda</Label>
              <Select
                value={settings.currency || 'BRL'}
                onValueChange={(v) => handleChange('currency', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">Real (R$)</SelectItem>
                  <SelectItem value="USD">Dólar ($)</SelectItem>
                  <SelectItem value="EUR">Euro (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fuso Horário</Label>
              <Select
                value={settings.timezone || 'America/Sao_Paulo'}
                onValueChange={(v) => handleChange('timezone', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                  <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                  <SelectItem value="America/Fortaleza">Fortaleza (GMT-3)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Idioma</Label>
              <Select
                value={settings.language || 'pt-BR'}
                onValueChange={(v) => handleChange('language', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (BR)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pagamentos (Modelo Canônico — plug-and-play via Gateway Registry) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Pagamentos
              </CardTitle>
              <CardDescription>
                Configure o provedor e os métodos habilitados
              </CardDescription>
            </div>
            {gatewayConfig.provider !== 'none' && (() => {
              const gwDef = getGatewayById(gatewayConfig.provider);
              const statusBadge = gwDef ? getGatewayStatusBadge(gwDef.status) : null;
              return (
                <div className="flex items-center gap-2">
                  {statusBadge && (
                    <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                  )}
                  <Badge variant={gatewayConfig.configuredAt ? 'default' : 'secondary'}>
                    {gatewayConfig.configuredAt ? 'Configurado' : 'Pendente'}
                  </Badge>
                </div>
              );
            })()}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Provedor</Label>
              <Select
                value={gatewayConfig.provider || 'none'}
                onValueChange={(value) => updatePaymentGatewayConfig({
                  provider: normalizeProvider(value as PaymentProvider),
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o provedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {getAvailableGateways().map((gw) => {
                    const badge = getGatewayStatusBadge(gw.status);
                    return (
                      <SelectItem
                        key={gw.id}
                        value={gw.id}
                        disabled={gw.status === 'coming_soon'}
                      >
                        {gw.displayName}{gw.status !== 'stable' ? ` (${badge.label})` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ambiente</Label>
              <Select
                value={gatewayConfig.environment || 'sandbox'}
                onValueChange={(value) => updatePaymentGatewayConfig({
                  environment: value as PaymentEnvironment,
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (Teste)</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {gatewayConfig.environment === 'production' && (
            <Alert className="border-yellow-500 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Modo produção ativo. As transações serão processadas com valores reais.
              </AlertDescription>
            </Alert>
          )}

          {gatewayConfig.provider !== 'none' && (
            <>
              <div className="space-y-3">
                <Label className="text-base font-medium">Métodos de Pagamento</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Dinheiro</Label>
                      <p className="text-xs text-muted-foreground">Pagamento em espécie</p>
                    </div>
                    <Switch
                      checked={gatewayConfig.enabledMethods.cash}
                      onCheckedChange={(v) => updatePaymentGatewayConfig({
                        enabledMethods: { cash: !!v },
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>PIX</Label>
                      <p className="text-xs text-muted-foreground">QR Code instantâneo</p>
                    </div>
                    <Switch
                      checked={gatewayConfig.enabledMethods.pix}
                      onCheckedChange={(v) => updatePaymentGatewayConfig({
                        enabledMethods: { pix: !!v },
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Crédito</Label>
                      <p className="text-xs text-muted-foreground">Cartão de crédito</p>
                    </div>
                    <Switch
                      checked={gatewayConfig.enabledMethods.credit}
                      onCheckedChange={(v) => updatePaymentGatewayConfig({
                        enabledMethods: { credit: !!v },
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Débito</Label>
                      <p className="text-xs text-muted-foreground">Cartão de débito</p>
                    </div>
                    <Switch
                      checked={gatewayConfig.enabledMethods.debit}
                      onCheckedChange={(v) => updatePaymentGatewayConfig({
                        enabledMethods: { debit: !!v },
                      })}
                    />
                  </div>
                </div>
              </div>

              {gatewayConfig.enabledMethods.pix && (
                <div>
                  <Label>Chave PIX</Label>
                  <Input
                    value={gatewayConfig.pixKey || ''}
                    onChange={(e) => updatePaymentGatewayConfig({ pixKey: e.target.value })}
                    placeholder="CPF, CNPJ, e-mail ou chave aleatória"
                  />
                </div>
              )}

              {/* Campos específicos do gateway — renderização dinâmica via Gateway Registry */}
              {(() => {
                const gwDef = getGatewayById(gatewayConfig.provider);
                if (!gwDef) return null;
                const fsKey = gwDef.firestoreKey as keyof NonNullable<PaymentGatewayConfig['providers']>;
                const providerData = (gatewayConfig.providers as Record<string, Record<string, any> | undefined>)?.[fsKey] || {};

                // Helper to get nested value (e.g. 'plugpag.enabled' → providerData.plugpag?.enabled)
                const getNestedValue = (key: string): any => {
                  const parts = key.split('.');
                  let val: any = providerData;
                  for (const p of parts) { val = val?.[p]; }
                  return val;
                };

                // Helper to build nested update object (e.g. 'plugpag.enabled', true → { plugpag: { enabled: true } })
                const buildNestedUpdate = (key: string, value: any): Record<string, any> => {
                  const parts = key.split('.');
                  if (parts.length === 1) return { [key]: value };
                  const result: Record<string, any> = {};
                  let current = result;
                  for (let i = 0; i < parts.length - 1; i++) {
                    current[parts[i]] = {};
                    current = current[parts[i]];
                  }
                  current[parts[parts.length - 1]] = value;
                  return result;
                };

                return (
                  <div className="space-y-4">
                    {gwDef.configFields.map((field) => {
                      // Conditional visibility: skip if dependsOn key is falsy
                      if (field.dependsOn && !getNestedValue(field.dependsOn)) {
                        return null;
                      }

                      // Section header
                      if (field.type === 'section') {
                        return (
                          <div key={field.key} className="pt-2 pb-1 border-b">
                            <Label className="text-sm font-semibold">{field.label}</Label>
                            {field.helpText && (
                              <p className="text-xs text-muted-foreground mt-0.5">{field.helpText}</p>
                            )}
                          </div>
                        );
                      }

                      // Toggle
                      if (field.type === 'toggle') {
                        return (
                          <div key={field.key} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                            <div>
                              <Label className="text-sm font-medium">{field.label}</Label>
                              {field.helpText && (
                                <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">{field.helpText}</p>
                              )}
                            </div>
                            <Switch
                              checked={!!getNestedValue(field.key)}
                              onCheckedChange={(checked) => updatePaymentGatewayConfig({
                                providers: { [fsKey]: buildNestedUpdate(field.key, checked) },
                              })}
                            />
                          </div>
                        );
                      }

                      // Text / Password / Select
                      return (
                        <div key={field.key} className="max-w-md">
                          <Label className="text-sm">{field.label}{field.required ? ' *' : ''}</Label>
                          <Input
                            type={field.type === 'password' ? 'password' : 'text'}
                            value={getNestedValue(field.key) || ''}
                            onChange={(e) => updatePaymentGatewayConfig({
                              providers: { [fsKey]: buildNestedUpdate(field.key, e.target.value) },
                            })}
                            placeholder={field.placeholder}
                            className="mt-1"
                          />
                          {field.helpText && (
                            <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                          )}
                        </div>
                      );
                    })}

                    {/* Notas informativas do gateway */}
                    {gwDef.adminNotes && gwDef.adminNotes.length > 0 && (
                      <Alert className="border-blue-200 bg-blue-50 mt-4">
                        <Info className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-800 text-xs space-y-1">
                          {gwDef.adminNotes.map((note, i) => (
                            <p key={i} className={note.startsWith('  ') ? 'font-mono text-xs ml-2' : ''}>
                              {note}
                            </p>
                          ))}
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Orientação: Terminal e POS são configurados por torneira */}
                    {gwDef.id === 'mercado_pago' && (
                      <Alert className="border-amber-200 bg-amber-50 mt-4">
                        <Info className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-amber-800 text-sm">
                          <strong>Terminal Point</strong> e <strong>External POS ID</strong> são configurados individualmente por torneira na seção <em>"Configuração de Torneiras (GPIO)"</em> abaixo. Cada torneira pode ter sua própria maquininha e caixa QR.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setShowClearGatewayDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar Configuração
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ESP32 / Hardware Status - MONITORAMENTO EM TEMPO REAL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Cpu className="h-5 w-5 mr-2" />
              Dispositivo ESP32 e Hardware
            </div>
            {hardwareLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : hardwareStatus?.lastHeartbeat ? (
              <Badge variant="outline" className="text-xs font-normal">
                <Activity className="h-3 w-3 mr-1" />
                Tempo real
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            Status ao vivo do hardware de dispensação e configuração de torneiras
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection Status - Usa dados em tempo real quando disponível */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              {deviceStatus.state === 'online' ? (
                <div className="relative">
                  <Wifi className="h-5 w-5 text-green-600" />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                </div>
              ) : deviceStatus.state === 'offline' ? (
                <WifiOff className="h-5 w-5 text-orange-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">Status de Conexão</p>
                <p className="text-sm text-muted-foreground">
                  {deviceStatus.message}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={
                deviceStatus.state === 'online' ? 'default' :
                deviceStatus.state === 'connecting' ? 'outline' :
                deviceStatus.state === 'offline' ? 'secondary' :
                'destructive'
              }>
                {deviceStatus.state === 'online' && (
                  <span className="flex items-center">
                    <Activity className="h-3 w-3 mr-1" />
                    {deviceStatus.lastSeenAt
                      ? `Online • ${deviceStatus.lastSeenAt.toLocaleTimeString('pt-BR')}`
                      : 'Online'}
                  </span>
                )}
                {deviceStatus.state === 'offline' && 'Offline'}
                {deviceStatus.state === 'connecting' && 'Conectando...'}
                {deviceStatus.state === 'unconfigured' && 'Não Configurado'}
                {deviceStatus.state === 'error' && 'Erro'}
              </Badge>
            </div>
          </div>

          {/* Hardware Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-muted-foreground">Firmware</p>
              <p className="font-medium">
                {deviceStatus.firmwareVersion || (
                  <span className="text-muted-foreground">Não disponível</span>
                )}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-muted-foreground">Última Sync</p>
              <p className="font-medium">
                {deviceStatus.lastSeenAt
                  ? deviceStatus.lastSeenAt.toLocaleString('pt-BR')
                  : '-'}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-muted-foreground">MAC Address</p>
              <p className="font-medium font-mono text-xs">
                {deviceStatus.macAddress || (
                  <span className="text-muted-foreground">Não disponível</span>
                )}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-muted-foreground">IP Address</p>
              <p className="font-medium font-mono text-xs">
                {deviceStatus.ipAddress || '-'}
              </p>
            </div>
          </div>

          {/* Dispensers Status - Tempo Real */}
          {(hardwareStatus?.dispensers && hardwareStatus.dispensers.length > 0) && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center text-foreground">
                <Droplets className="h-4 w-4 mr-2" />
                Torneiras Conectadas ({hardwareStatus.dispensers.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hardwareStatus.dispensers.map((dispenser) => (
                  <div 
                    key={dispenser.id} 
                    className={`p-3 rounded-lg border ${
                      dispenser.status === 'ready' ? 'border-green-200 bg-green-50' :
                      dispenser.status === 'busy' ? 'border-blue-200 bg-blue-50' :
                      dispenser.status === 'error' ? 'border-red-200 bg-red-50' :
                      'border-border bg-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Droplets className={`h-4 w-4 ${
                          dispenser.status === 'ready' ? 'text-green-600' :
                          dispenser.status === 'busy' ? 'text-blue-600' :
                          dispenser.status === 'error' ? 'text-red-600' :
                          'text-muted-foreground'
                        }`} />
                        <span className="font-medium">
                          {dispenser.name || `Torneira ${dispenser.id}`}
                        </span>
                      </div>
                      <Badge variant={
                        dispenser.status === 'ready' ? 'default' :
                        dispenser.status === 'busy' ? 'secondary' :
                        dispenser.status === 'error' ? 'destructive' :
                        'outline'
                      } className="text-xs">
                        {dispenser.status === 'ready' ? 'Pronta' :
                         dispenser.status === 'busy' ? 'Dispensando' :
                         dispenser.status === 'error' ? 'Erro' : 'Offline'}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {dispenser.productName && <p>Produto: {dispenser.productName}</p>}
                      {dispenser.totalDispenses !== undefined && <p>Total dispensado: {dispenser.totalDispenses}x</p>}
                      {dispenser.lastDispense && (
                        <p>Último: {new Date(dispenser.lastDispense).toLocaleTimeString('pt-BR')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Printer Status */}
          {hardwareStatus?.printer && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <Printer className={`h-5 w-5 ${hardwareStatus.printer.isConnected ? 'text-green-600' : 'text-muted-foreground'}`} />
                <div>
                  <p className="font-medium">Impressora</p>
                  <p className="text-xs text-muted-foreground">{hardwareStatus.printer.model || 'Genérica'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={hardwareStatus.printer.isConnected ? 'default' : 'secondary'}>
                  {hardwareStatus.printer.isConnected ? 'Conectada' : 'Desconectada'}
                </Badge>
                {hardwareStatus.printer.paperStatus && (
                  <Badge variant={
                    hardwareStatus.printer.paperStatus === 'ok' ? 'outline' :
                    hardwareStatus.printer.paperStatus === 'low' ? 'secondary' : 'destructive'
                  } className="text-xs">
                    {hardwareStatus.printer.paperStatus === 'ok' ? 'Papel OK' :
                     hardwareStatus.printer.paperStatus === 'low' ? 'Papel Baixo' : 'Sem Papel'}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Error Alerts */}
          {deviceStatus.lastError && (
            <Alert className="border-red-500 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>Último erro:</strong> {deviceStatus.lastError}
              </AlertDescription>
            </Alert>
          )}

          {(deviceStatus.state === 'offline' || deviceStatus.state === 'error') && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                O dispositivo ESP32 não está conectado. Verifique a conexão Wi-Fi e as configurações do firmware.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Tap Configuration — XIAO ESP32-S3 GPIO Mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Droplets className="h-5 w-5 mr-2" />
              Configuração de Torneiras (GPIO)
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const currentTaps = settings.taps || [];
                const maxTaps = settings.maxTaps || 4;
                if (currentTaps.length >= maxTaps) {
                  toast.error(`Maximo de ${maxTaps} torneiras permitido`);
                  return;
                }
                const newId = currentTaps.length > 0
                  ? Math.max(...currentTaps.map(t => t.id)) + 1
                  : 0;
                handleChange('taps', [
                  ...currentTaps,
                  {
                    id: newId,
                    name: `Torneira ${newId + 1}`,
                    enabled: true,
                    calibration: { pulsesPerLiter: 5680, mlPerSecond: 33.3 }
                  } as TapConfigLocal,
                ]);
              }}
              disabled={(settings.taps?.length || 0) >= (settings.maxTaps || 4)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Torneira
            </Button>
          </CardTitle>
          <CardDescription>
            Board: XIAO ESP32-S3 - Vincule GPIO a cada torneira (max. {settings.maxTaps || 4})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Advanced Mode Toggle */}
          <div className="flex items-center gap-2 text-xs">
            <Switch
              id="gpio-advanced-mode"
              checked={!!(settings as any).__gpioAdvancedMode}
              onCheckedChange={(checked) => {
                handleChange('__gpioAdvancedMode' as any, checked);
              }}
            />
            <Label htmlFor="gpio-advanced-mode" className="text-xs text-muted-foreground cursor-pointer">
              Modo Avançado (habilita GPIO 43/44 — TX/RX UART)
            </Label>
          </div>

          {(!settings.taps || settings.taps.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground">
              <Droplets className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma torneira configurada</p>
              <p className="text-sm">Clique em "Adicionar Torneira" para comecar</p>
            </div>
          ) : (
            <div className="space-y-4">
              {settings.taps.map((tap, index) => {
                const advancedMode = !!(settings as any).__gpioAdvancedMode;
                const pinOptions = advancedMode
                  ? [...XIAO_GPIO_OPTIONS, ...XIAO_UART_OPTIONS]
                  : XIAO_GPIO_OPTIONS;
                // Compute which pins are already used by OTHER taps
                const usedValvePins = new Set(
                  settings.taps!.filter((_, i) => i !== index).map(t => t.valvePin).filter((p): p is number => p !== undefined)
                );
                const usedSensorPins = new Set(
                  settings.taps!.filter((_, i) => i !== index).map(t => t.sensorPin).filter((p): p is number => p !== undefined)
                );

                const valveValidation = validateGpioPin(tap.valvePin, true, advancedMode);
                const sensorValidation = validateGpioPin(tap.sensorPin, false, advancedMode);
                const samePinConflict = tap.valvePin !== undefined && tap.sensorPin !== undefined && tap.valvePin === tap.sensorPin;

                return (
                  <div
                    key={tap.id}
                    className={`p-4 border rounded-lg space-y-3 ${!tap.enabled ? 'opacity-60 bg-muted' : ''}`}
                  >
                    {/* Header: Name + Enable + Delete */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${tap.enabled ? 'bg-green-100' : 'bg-muted'}`}>
                          <Droplets className={`h-4 w-4 ${tap.enabled ? 'text-green-600' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={tap.name}
                            onChange={(e) => {
                              const updated = [...settings.taps!];
                              updated[index] = { ...updated[index], name: e.target.value };
                              handleChange('taps', updated);
                            }}
                            className="font-medium w-40"
                            placeholder="Nome da torneira"
                          />
                          <span className="text-xs text-muted-foreground">ID: {tap.id}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tap.enabled}
                          onCheckedChange={(checked) => {
                            const updated = [...settings.taps!];
                            updated[index] = { ...updated[index], enabled: checked };
                            handleChange('taps', updated);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            const updated = settings.taps!.filter((_, i) => i !== index);
                            handleChange('taps', updated);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* GPIO Pins — Dropdown Selectors */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-medium">Pino da Valvula (OUTPUT)</Label>
                        <select
                          className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-white"
                          value={tap.valvePin ?? ''}
                          onChange={(e) => {
                            const updated = [...settings.taps!];
                            const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                            updated[index] = { ...updated[index], valvePin: val };
                            handleChange('taps', updated);
                          }}
                        >
                          <option value="">-- Selecione GPIO --</option>
                          {pinOptions.map(opt => {
                            const isUsed = usedValvePins.has(opt.gpio) || usedSensorPins.has(opt.gpio);
                            return (
                              <option key={opt.gpio} value={opt.gpio} disabled={isUsed}>
                                {opt.label}{isUsed ? ' (em uso)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        {valveValidation.warning && (
                          <p className={`text-xs mt-1 ${valveValidation.valid ? 'text-yellow-600' : 'text-red-600'}`}>
                            <AlertTriangle className="h-3 w-3 inline mr-1" />
                            {valveValidation.warning}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs font-medium">Pino do Sensor de Fluxo (INPUT)</Label>
                        <select
                          className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-white"
                          value={tap.sensorPin ?? ''}
                          onChange={(e) => {
                            const updated = [...settings.taps!];
                            const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                            updated[index] = { ...updated[index], sensorPin: val };
                            handleChange('taps', updated);
                          }}
                        >
                          <option value="">-- Selecione GPIO --</option>
                          {pinOptions.map(opt => {
                            const isUsed = usedValvePins.has(opt.gpio) || usedSensorPins.has(opt.gpio);
                            return (
                              <option key={opt.gpio} value={opt.gpio} disabled={isUsed}>
                                {opt.label}{isUsed ? ' (em uso)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        {sensorValidation.warning && (
                          <p className={`text-xs mt-1 ${sensorValidation.valid ? 'text-yellow-600' : 'text-red-600'}`}>
                            <AlertTriangle className="h-3 w-3 inline mr-1" />
                            {sensorValidation.warning}
                          </p>
                        )}
                      </div>
                    </div>
                    {samePinConflict && (
                      <p className="text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        Valvula e sensor não podem usar o mesmo GPIO!
                      </p>
                    )}

                    {/* Calibration */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-medium">Pulsos por Litro</Label>
                        <Input
                          type="number"
                          min={1}
                          max={99999}
                          value={tap.calibration?.pulsesPerLiter ?? ''}
                          onChange={(e) => {
                            const updated = [...settings.taps!];
                            updated[index] = {
                              ...updated[index],
                              calibration: {
                                ...updated[index].calibration,
                                pulsesPerLiter: e.target.value === '' ? undefined : parseInt(e.target.value),
                              },
                            };
                            handleChange('taps', updated);
                          }}
                          placeholder="5680"
                          className="w-32"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">Sensor YF-S201: ~5680</p>
                      </div>
                      <div>
                        <Label className="text-xs font-medium">mL por Segundo (vazao)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0.1}
                          max={500}
                          value={tap.calibration?.mlPerSecond ?? ''}
                          onChange={(e) => {
                            const updated = [...settings.taps!];
                            updated[index] = {
                              ...updated[index],
                              calibration: {
                                ...updated[index].calibration,
                                mlPerSecond: e.target.value === '' ? undefined : parseFloat(e.target.value),
                              },
                            };
                            handleChange('taps', updated);
                          }}
                          placeholder="33.3"
                          className="w-32"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">Valor tipico: 30-40 mL/s</p>
                      </div>
                    </div>

                    {/* ── Terminais de Pagamento (por gateway ativo) ──────────── */}
                    {gatewayConfig.provider !== 'none' && (
                      <div className="mt-2 p-3 border rounded-lg bg-muted/20 space-y-3">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          💳 Terminal de Pagamento — {tap.name}
                        </Label>

                        {/* Mercado Pago Point — visível quando provider = mercado_pago */}
                        {gatewayConfig.provider === 'mercado_pago' && (
                          <div className="space-y-3">
                            <div>
                              <Label className="text-xs font-medium">Terminal Point (Maquininha)</Label>
                              <Input
                                value={tap.mpTerminalId ?? ''}
                                onChange={(e) => {
                                  const updated = [...settings.taps!];
                                  const val = e.target.value.trim();
                                  updated[index] = { ...updated[index], mpTerminalId: val || undefined };
                                  handleChange('taps', updated);
                                }}
                                placeholder="Ex: NEWLAND_N950__N950NCB300544833"
                                className="w-72 font-mono"
                                maxLength={128}
                              />
                              <p className="text-xs text-muted-foreground mt-0.5">
                                ID da maquininha Point vinculada a esta torneira. Obrigatório para pagamento com cartão. Encontre em: Mercado Pago → Seus dispositivos Point.
                              </p>
                            </div>
                            <div>
                              <Label className="text-xs font-medium">External POS ID (Caixa QR)</Label>
                              <Input
                                value={tap.mpExternalPosId ?? ''}
                                onChange={(e) => {
                                  const updated = [...settings.taps!];
                                  const val = e.target.value.trim();
                                  updated[index] = { ...updated[index], mpExternalPosId: val || undefined };
                                  handleChange('taps', updated);
                                }}
                                placeholder="Ex: KIOSKPOS001"
                                className="w-72 font-mono"
                                maxLength={128}
                              />
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Identificador do caixa (POS) registrado na API do Mercado Pago para esta torneira. Obrigatório para QR dinâmico. Cada torneira deve ter seu próprio POS.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* PagBank PlugPag — visível quando provider = pagbank */}
                        {gatewayConfig.provider === 'pagbank' && (
                          <div>
                            <Label className="text-xs font-medium">Identificador do terminal PagBank (PlugPag)</Label>
                            <Input
                              value={tap.plugpagDeviceId ?? ''}
                              onChange={(e) => {
                                const updated = [...settings.taps!];
                                const val = e.target.value.trim().toUpperCase();
                                updated[index] = { ...updated[index], plugpagDeviceId: val || undefined };
                                handleChange('taps', updated);
                              }}
                              placeholder="PRO-1733203195 ou 90:97:D5:F1:74:B5"
                              className="w-56 font-mono"
                              maxLength={64}
                            />
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Para Moderninha PRO/PRO 2/WIFI, use o identificador de pareamento Bluetooth (ex: <span className="font-mono">PRO-1733203195</span>).
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 text-xs text-muted-foreground">
          {/* Duplicate GPIO pin warning */}
          {settings.taps && settings.taps.length > 1 && (() => {
            const dupes = findDuplicateGpioPins(settings.taps!);
            if (dupes.size === 0) return null;
            return (
              <div className="w-full p-2 bg-red-50 border border-red-200 rounded text-red-700">
                <div className="flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  Conflito de pinos GPIO
                </div>
                {Array.from(dupes.entries()).map(([pin, users]) => (
                  <p key={pin} className="ml-4">GPIO {pin} usado por: {users.join(', ')}</p>
                ))}
              </div>
            );
          })()}
          <span>
            Última atualização:{' '}
            {settings.tapsUpdatedAt
              ? (() => {
                  const raw = settings.tapsUpdatedAt as any;
                  const d = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw);
                  return isNaN(d.getTime()) ? 'Data indisponível' : d.toLocaleString('pt-BR');
                })()
              : 'Nunca'}
            {settings.tapsVersion != null && ` (v${settings.tapsVersion})`}
          </span>
        </CardFooter>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Bell className="h-5 w-5 mr-2" />
            Notificações e Alertas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Notificações de Pedidos</Label>
              <p className="text-sm text-muted-foreground">Receber alertas de novos pedidos</p>
            </div>
            <Switch
              checked={settings.orderNotifications ?? true}
              onCheckedChange={(v) => handleChange('orderNotifications', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Alertas de Estoque Baixo</Label>
              <p className="text-sm text-muted-foreground">Notificar quando o estoque estiver baixo</p>
            </div>
            <Switch
              checked={settings.lowStockAlerts ?? true}
              onCheckedChange={(v) => handleChange('lowStockAlerts', v)}
            />
          </div>
          {settings.lowStockAlerts && (
            <div>
              <Label>Limite de Estoque Baixo</Label>
              <Input
                type="number"
                min={1}
                value={settings.lowStockThreshold || 5}
                onChange={(e) => handleChange('lowStockThreshold', Number(e.target.value))}
                className="w-24"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kiosk Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações do Kiosk</CardTitle>
          <CardDescription>
            Opções para o modo quiosque de autoatendimento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Settings controls */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Modo Kiosk</Label>
                  <p className="text-sm text-muted-foreground">Habilitar interface de autoatendimento</p>
                </div>
                <Switch
                  checked={settings.kioskEnabled ?? false}
                  onCheckedChange={(v) => handleChange('kioskEnabled', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Tela de Atração</Label>
                  <p className="text-sm text-muted-foreground">Mostrar vídeo/imagem quando ocioso</p>
                </div>
                <Switch
                  checked={settings.attractScreenEnabled ?? true}
                  onCheckedChange={(v) => handleChange('attractScreenEnabled', v)}
                />
              </div>
              <div>
                <Label>Tempo de Inatividade (segundos)</Label>
                <Input
                  type="number"
                  min={10}
                  max={300}
                  value={settings.attractTimeoutSeconds ?? 60}
                  onChange={(e) => handleChange('attractTimeoutSeconds', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </div>

            {/* Live Preview */}
            <div className="flex flex-col items-center gap-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Preview ao Vivo</Label>
              <div
                className="relative w-full max-w-[240px] aspect-[9/16] rounded-xl border-2 border-muted-foreground/20 bg-gray-900 overflow-hidden shadow-lg"
              >
                {/* Status bar mock */}
                <div className="absolute top-0 inset-x-0 h-5 bg-black/40 flex items-center justify-between px-2 z-10">
                  <span className="text-[8px] text-white/70 font-mono">12:00</span>
                  <div className="flex gap-0.5">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <div className="w-2 h-2 rounded-full bg-white/50" />
                  </div>
                </div>

                {!(settings.kioskEnabled ?? false) ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center p-3">
                      <XCircle className="h-8 w-8 mx-auto text-red-400/60 mb-1" />
                      <p className="text-[10px] text-white/50 font-medium">Kiosk Desativado</p>
                    </div>
                  </div>
                ) : (settings.attractScreenEnabled ?? true) ? (
                  <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-blue-900 to-blue-950">
                    <div className="animate-pulse mb-2">
                      <Activity className="h-10 w-10 text-blue-400/70" />
                    </div>
                    <p className="text-xs text-blue-200/80 font-semibold">Tela de Atração</p>
                    <p className="text-[9px] text-blue-300/50 mt-0.5">
                      Timeout: {settings.attractTimeoutSeconds ?? 60}s
                    </p>
                    {settings.attractVideoConfig?.isEnabled && (
                      <Badge variant="outline" className="mt-2 text-[8px] border-blue-400/30 text-blue-300/70">
                        <Video className="h-2.5 w-2.5 mr-0.5" /> Vídeo ativo
                      </Badge>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-gray-800 to-gray-900">
                    <CheckCircle className="h-8 w-8 text-green-400/70 mb-1" />
                    <p className="text-xs text-white/80 font-semibold">Kiosk Ativo</p>
                    <p className="text-[9px] text-white/40 mt-0.5">Sem tela de atração</p>
                  </div>
                )}

                {/* Home indicator mock */}
                <div className="absolute bottom-1 inset-x-0 flex justify-center">
                  <div className="w-12 h-1 rounded-full bg-white/20" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attract Video Config */}
      <AttractVideoCard
        videoConfig={settings.attractVideoConfig || { isEnabled: false }}
        franchiseId={franchiseId}
        storeId={storeId}
        onVideoConfigChange={(update) => {
          const current = settings.attractVideoConfig || { isEnabled: false };
          handleChange('attractVideoConfig', { ...current, ...update });
        }}
      />

      {/* Save Button at bottom */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || updateSettingsMutation.isPending || !can('settings:update')}
          size="lg"
        >
          {updateSettingsMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>

      {/* [FIX GES-15] AlertDialog para limpar gateway */}
      <AlertDialog open={showClearGatewayDialog} onOpenChange={setShowClearGatewayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar configuração do gateway?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá resetar todas as configurações do gateway de pagamento.
              Pagamentos via gateway não funcionarão até reconfigurar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleClearGatewayConfig}>
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
