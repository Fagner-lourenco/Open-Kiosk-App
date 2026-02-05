/**
 * ============================================================================
 * Store Settings Tab Component
 * ============================================================================
 * 
 * Componente para configurações de uma loja específica.
 * Permite editar configurações com persistência no Firestore.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Loader2, Save, CreditCard, Bell, Cpu, Wifi, WifiOff, AlertTriangle, Trash2, Droplets, Printer, Plus, X, Activity, Clock } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';
import type { PaymentGatewayConfig, PaymentProvider, PaymentEnvironment, EnabledPaymentMethods } from '@/types/store';

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

// Interface para configuração de dispensadores
interface DispenserConfig {
  id: number;
  name: string;
  productId?: string;
  calibration?: {
    mlPerPulse: number;
    flowTimeout: number;
  };
  enabled: boolean;
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
  
  // Dispensers Configuration
  dispensers?: DispenserConfig[];
  maxDispensers?: number; // Máximo de torneiras (default 4)
  
  // Notifications
  orderNotifications?: boolean;
  lowStockAlerts?: boolean;
  lowStockThreshold?: number;
  
  // Kiosk
  kioskMode?: boolean;
  attractScreenEnabled?: boolean;
  idleTimeout?: number;
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

const normalizeProvider = (provider?: PaymentProvider | string): PaymentProvider => {
  if (!provider) return 'none';
  if (provider === 'mercadopago') return 'mercado_pago';
  return provider as PaymentProvider;
};

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
        clientId: current?.providers?.pagbank?.clientId || legacyGateway?.clientId,
        merchantId: current?.providers?.pagbank?.merchantId || legacyGateway?.merchantId,
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
  return sanitized;
};

const validatePaymentGatewayConfig = (config: PaymentGatewayConfig): string[] => {
  const errors: string[] = [];

  if (config.provider === 'pagbank') {
    const clientId = config.providers?.pagbank?.clientId;
    const publicKey = config.providers?.pagbank?.publicKey;
    const needsPix = config.enabledMethods?.pix;
    const needsCard = config.enabledMethods?.credit || config.enabledMethods?.debit;

    if ((needsPix || needsCard) && !clientId) {
      errors.push('PagBank: Client ID é obrigatório.');
    }
    if (needsCard && !publicKey) {
      errors.push('PagBank: Public Key é obrigatório para cartão.');
    }
  }

  return errors;
};

export function StoreSettingsTab({ franchiseId, storeId }: StoreSettingsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Estado para hardware em tempo real
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus | null>(null);
  const [hardwareLoading, setHardwareLoading] = useState(true);

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
      setSettings({
        ...storeData,
        paymentGatewayConfig: normalizedConfig,
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

        const paymentGatewayConfig = sanitizePaymentGatewayConfigForSave(
          (sanitizedSettings.paymentGatewayConfig || normalizePaymentGatewayConfig(sanitizedSettings)) as PaymentGatewayConfig
        );

        await updateDoc(storeRef, {
          ...sanitizedSettings,
          paymentGatewayConfig,
          updatedAt: new Date(),
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings', franchiseId, storeId] });
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Configurações salvas com sucesso');
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
    providers?: {
      pagbank?: Partial<NonNullable<PaymentGatewayConfig['providers']>['pagbank']>;
      mercadopago?: Partial<NonNullable<PaymentGatewayConfig['providers']>['mercadopago']>;
    };
  };

  const updatePaymentGatewayConfig = (partial: PaymentGatewayConfigUpdate) => {
    if (!settings) return;
    const current = settings.paymentGatewayConfig || normalizePaymentGatewayConfig(settings);
    const next: PaymentGatewayConfig = {
      ...current,
      ...partial,
      enabledMethods: {
        ...current.enabledMethods,
        ...(partial.enabledMethods || {}),
      },
      providers: {
        ...current.providers,
        ...partial.providers,
        pagbank: {
          ...current.providers?.pagbank,
          ...partial.providers?.pagbank,
        },
        mercadopago: {
          ...current.providers?.mercadopago,
          ...partial.providers?.mercadopago,
        },
      },
    };
    handleChange('paymentGatewayConfig', next);
  };

  const handleClearGatewayConfig = () => {
    if (!settings) return;
    handleChange('paymentGatewayConfig', {
      provider: 'none',
      environment: 'sandbox',
      enabledMethods: { ...DEFAULT_ENABLED_METHODS },
    } as PaymentGatewayConfig);
    toast.success('Configuração do gateway limpa');
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
          <Button onClick={handleSave} disabled={updateSettingsMutation.isPending}>
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
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pagamentos (Modelo Canônico) */}
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
            {gatewayConfig.provider !== 'none' && (
              <Badge variant={gatewayConfig.configuredAt ? 'default' : 'secondary'}>
                {gatewayConfig.configuredAt ? 'Configurado' : 'Pendente'}
              </Badge>
            )}
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
                  <SelectItem value="mercado_pago">Mercado Pago</SelectItem>
                  <SelectItem value="pagbank">PagBank</SelectItem>
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
                      <p className="text-xs text-gray-500">Pagamento em espécie</p>
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
                      <p className="text-xs text-gray-500">QR Code instantâneo</p>
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
                      <p className="text-xs text-gray-500">Cartão de crédito</p>
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
                      <p className="text-xs text-gray-500">Cartão de débito</p>
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

              {gatewayConfig.provider === 'pagbank' && (
                <div className="space-y-3">
                  <Label className="text-base font-medium">PagBank</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Client ID</Label>
                      <Input
                        value={gatewayConfig.providers?.pagbank?.clientId || ''}
                        onChange={(e) => updatePaymentGatewayConfig({
                          providers: { pagbank: { clientId: e.target.value } },
                        })}
                        placeholder="Client ID (PagBank)"
                      />
                    </div>
                    <div>
                      <Label>Merchant ID</Label>
                      <Input
                        value={gatewayConfig.providers?.pagbank?.merchantId || ''}
                        onChange={(e) => updatePaymentGatewayConfig({
                          providers: { pagbank: { merchantId: e.target.value } },
                        })}
                        placeholder="Merchant ID (opcional)"
                      />
                    </div>
                    <div>
                      <Label>Public Key</Label>
                      <Input
                        value={gatewayConfig.providers?.pagbank?.publicKey || ''}
                        onChange={(e) => updatePaymentGatewayConfig({
                          providers: { pagbank: { publicKey: e.target.value } },
                        })}
                        placeholder="Public Key (opcional)"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Segredos (client secret / tokens) não são salvos no Firestore. Configure via env vars nas Functions.
                  </p>
                </div>
              )}

              {gatewayConfig.provider === 'mercado_pago' && (
                <div className="space-y-3">
                  <Label className="text-base font-medium">Mercado Pago</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>User ID</Label>
                      <Input
                        value={gatewayConfig.providers?.mercadopago?.userId || ''}
                        onChange={(e) => updatePaymentGatewayConfig({
                          providers: { mercadopago: { userId: e.target.value } },
                        })}
                        placeholder="ID do usuário no gateway"
                      />
                    </div>
                    <div>
                      <Label>External POS ID</Label>
                      <Input
                        value={gatewayConfig.providers?.mercadopago?.externalPosId || ''}
                        onChange={(e) => updatePaymentGatewayConfig({
                          providers: { mercadopago: { externalPosId: e.target.value } },
                        })}
                        placeholder="Ex: KIOSK-001"
                      />
                      <p className="text-xs text-gray-500 mt-1">Identificador único do terminal</p>
                    </div>
                    <div>
                      <Label>Store ID (Gateway)</Label>
                      <Input
                        value={gatewayConfig.providers?.mercadopago?.storeId || ''}
                        onChange={(e) => updatePaymentGatewayConfig({
                          providers: { mercadopago: { storeId: e.target.value } },
                        })}
                        placeholder="ID da loja no gateway"
                      />
                    </div>
                    <div>
                      <Label>Terminal ID</Label>
                      <Input
                        value={gatewayConfig.providers?.mercadopago?.terminalId || ''}
                        onChange={(e) => updatePaymentGatewayConfig({
                          providers: { mercadopago: { terminalId: e.target.value } },
                        })}
                        placeholder="Ex: GERTEC_MP35P__12345"
                      />
                      <p className="text-xs text-gray-500 mt-1">ID do terminal físico para pagamentos com cartão</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={handleClearGatewayConfig}
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
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
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
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              {(hardwareStatus?.esp32?.isConnected ?? settings.esp32?.isConnected) ? (
                <div className="relative">
                  <Wifi className="h-5 w-5 text-green-600" />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                </div>
              ) : (
                <WifiOff className="h-5 w-5 text-gray-400" />
              )}
              <div>
                <p className="font-medium">Status de Conexão</p>
                <p className="text-sm text-gray-500">
                  {hardwareStatus?.esp32?.macAddress || settings.esp32?.macAddress || 'Dispositivo não configurado'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={(hardwareStatus?.esp32?.isConnected ?? settings.esp32?.isConnected) ? 'default' : 'secondary'}>
                {(hardwareStatus?.esp32?.isConnected ?? settings.esp32?.isConnected) ? 'Online' : 'Offline'}
              </Badge>
              {hardwareStatus?.lastHeartbeat && (
                <span className="text-xs text-gray-400 flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  {new Date(hardwareStatus.lastHeartbeat).toLocaleTimeString('pt-BR')}
                </span>
              )}
            </div>
          </div>

          {/* Hardware Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500">Firmware</p>
              <p className="font-medium">{hardwareStatus?.esp32?.firmwareVersion || settings.esp32?.firmwareVersion || '-'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500">Última Sync</p>
              <p className="font-medium">
                {(hardwareStatus?.esp32?.lastSeen || settings.esp32?.lastSeen)
                  ? new Date(hardwareStatus?.esp32?.lastSeen || settings.esp32?.lastSeen as Date).toLocaleString('pt-BR')
                  : '-'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500">MAC Address</p>
              <p className="font-medium font-mono text-xs">
                {hardwareStatus?.esp32?.macAddress || settings.esp32?.macAddress || '-'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500">IP Address</p>
              <p className="font-medium font-mono text-xs">
                {hardwareStatus?.esp32?.ipAddress || '-'}
              </p>
            </div>
          </div>

          {/* Dispensers Status - Tempo Real */}
          {(hardwareStatus?.dispensers && hardwareStatus.dispensers.length > 0) && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center text-gray-700">
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
                      'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Droplets className={`h-4 w-4 ${
                          dispenser.status === 'ready' ? 'text-green-600' :
                          dispenser.status === 'busy' ? 'text-blue-600' :
                          dispenser.status === 'error' ? 'text-red-600' :
                          'text-gray-400'
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
                    <div className="mt-2 text-xs text-gray-600">
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
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Printer className={`h-5 w-5 ${hardwareStatus.printer.isConnected ? 'text-green-600' : 'text-gray-400'}`} />
                <div>
                  <p className="font-medium">Impressora</p>
                  <p className="text-xs text-gray-500">{hardwareStatus.printer.model || 'Genérica'}</p>
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
          {(hardwareStatus?.esp32?.lastError || settings.esp32?.lastError) && (
            <Alert className="border-red-500 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>Último erro:</strong> {hardwareStatus?.esp32?.lastError || settings.esp32?.lastError}
              </AlertDescription>
            </Alert>
          )}

          {!(hardwareStatus?.esp32?.isConnected ?? settings.esp32?.isConnected) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                O dispositivo ESP32 não está conectado. Verifique a conexão Wi-Fi e as configurações do firmware.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Dispensers Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Droplets className="h-5 w-5 mr-2" />
              Configuração de Torneiras
            </div>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                const currentDispensers = settings.dispensers || [];
                const maxDispensers = settings.maxDispensers || 4;
                if (currentDispensers.length >= maxDispensers) {
                  toast.error(`Máximo de ${maxDispensers} torneiras permitido`);
                  return;
                }
                const newId = currentDispensers.length > 0 
                  ? Math.max(...currentDispensers.map(d => d.id)) + 1 
                  : 1;
                handleChange('dispensers', [
                  ...currentDispensers,
                  { 
                    id: newId, 
                    name: `Torneira ${newId}`, 
                    enabled: true,
                    calibration: { mlPerPulse: 1.0, flowTimeout: 30 }
                  }
                ]);
              }}
              disabled={(settings.dispensers?.length || 0) >= (settings.maxDispensers || 4)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Torneira
            </Button>
          </CardTitle>
          <CardDescription>
            Configure as torneiras de dispensação de sua loja (máx. {settings.maxDispensers || 4})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(!settings.dispensers || settings.dispensers.length === 0) ? (
            <div className="text-center py-8 text-gray-500">
              <Droplets className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma torneira configurada</p>
              <p className="text-sm">Clique em "Adicionar Torneira" para começar</p>
            </div>
          ) : (
            <div className="space-y-4">
              {settings.dispensers.map((dispenser, index) => (
                <div 
                  key={dispenser.id} 
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${dispenser.enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <Droplets className={`h-4 w-4 ${dispenser.enabled ? 'text-green-600' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <Input
                          value={dispenser.name}
                          onChange={(e) => {
                            const updated = [...settings.dispensers!];
                            updated[index] = { ...updated[index], name: e.target.value };
                            handleChange('dispensers', updated);
                          }}
                          className="font-medium w-40"
                          placeholder="Nome da torneira"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={dispenser.enabled}
                        onCheckedChange={(checked) => {
                          const updated = [...settings.dispensers!];
                          updated[index] = { ...updated[index], enabled: checked };
                          handleChange('dispensers', updated);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          const updated = settings.dispensers!.filter((_, i) => i !== index);
                          handleChange('dispensers', updated);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Calibration Settings */}
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                      ⚙️ Configurações Avançadas
                    </summary>
                    <div className="mt-3 grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded">
                      <div>
                        <Label className="text-xs">mL por Pulso</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="10"
                          value={dispenser.calibration?.mlPerPulse || 1.0}
                          onChange={(e) => {
                            const updated = [...settings.dispensers!];
                            updated[index] = { 
                              ...updated[index], 
                              calibration: { 
                                ...updated[index].calibration,
                                mlPerPulse: parseFloat(e.target.value) || 1.0,
                                flowTimeout: updated[index].calibration?.flowTimeout || 30
                              }
                            };
                            handleChange('dispensers', updated);
                          }}
                          className="w-24"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Timeout de Fluxo (s)</Label>
                        <Input
                          type="number"
                          min="5"
                          max="120"
                          value={dispenser.calibration?.flowTimeout || 30}
                          onChange={(e) => {
                            const updated = [...settings.dispensers!];
                            updated[index] = { 
                              ...updated[index], 
                              calibration: { 
                                mlPerPulse: updated[index].calibration?.mlPerPulse || 1.0,
                                flowTimeout: parseInt(e.target.value) || 30,
                              }
                            };
                            handleChange('dispensers', updated);
                          }}
                          className="w-24"
                        />
                      </div>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="text-xs text-gray-500">
          As configurações de torneiras são sincronizadas automaticamente com o Kiosk conectado.
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
              <p className="text-sm text-gray-500">Receber alertas de novos pedidos</p>
            </div>
            <Switch
              checked={settings.orderNotifications ?? true}
              onCheckedChange={(v) => handleChange('orderNotifications', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Alertas de Estoque Baixo</Label>
              <p className="text-sm text-gray-500">Notificar quando o estoque estiver baixo</p>
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
          <div className="flex items-center justify-between">
            <div>
              <Label>Modo Kiosk</Label>
              <p className="text-sm text-gray-500">Habilitar interface de autoatendimento</p>
            </div>
            <Switch
              checked={settings.kioskMode ?? false}
              onCheckedChange={(v) => handleChange('kioskMode', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Tela de Atração</Label>
              <p className="text-sm text-gray-500">Mostrar vídeo/imagem quando ocioso</p>
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
              value={settings.idleTimeout || 60}
              onChange={(e) => handleChange('idleTimeout', Number(e.target.value))}
              className="w-24"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button at bottom */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || updateSettingsMutation.isPending}
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
    </div>
  );
}
