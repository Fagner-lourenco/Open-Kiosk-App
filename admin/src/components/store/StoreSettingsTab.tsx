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
import { Settings, Loader2, Save, CreditCard, Bell, Cpu, Wifi, WifiOff, AlertTriangle, Eye, EyeOff, Zap, Trash2, Droplets, Printer, Plus, X, Activity, Clock } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';

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
  
  // Payments
  acceptCash?: boolean;
  acceptCard?: boolean;
  acceptPix?: boolean;
  pixKey?: string;
  
  // Payment Gateway (espelhando Kiosk)
  paymentGateway?: {
    provider?: string;
    mode?: 'sandbox' | 'production';
    accessToken?: string;
    userId?: string;           // ID do usuário no gateway
    externalPosId?: string;    // ID do POS/Terminal
    terminalId?: string;       // ID do terminal físico
    storeId?: string;          // ID da loja no gateway
    enabledMethods?: {         // Métodos habilitados
      pix?: boolean;
      credit?: boolean;
      debit?: boolean;
    };
    pollingIntervalMs?: number;    // Intervalo de polling (ms)
    pollingMaxAttempts?: number;   // Máximo de tentativas
    configuredAt?: string;         // Data de configuração
    lastValidatedAt?: string;      // Última validação
  };
  
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

export function StoreSettingsTab({ franchiseId, storeId }: StoreSettingsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  
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
      setSettings(storeData);
    }
  }, [storeData]);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<StoreSettings>) => {
      const storeRef = doc(db, 'franchises', franchiseId, 'stores', storeId);
        const sanitizedSettings = sanitizeFirestoreData(newSettings) as typeof newSettings;
        await updateDoc(storeRef, {
          ...sanitizedSettings,
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
      updateSettingsMutation.mutate(settings);
    }
  };

  const handleTestConnection = async () => {
    if (!settings?.paymentGateway?.accessToken) {
      toast.error('Configure o Access Token primeiro');
      return;
    }

    setTestingConnection(true);
    try {
      // Test based on provider
      const provider = settings.paymentGateway.provider;
      const token = settings.paymentGateway.accessToken;
      
      if (provider === 'mercadopago') {
        // Test Mercado Pago connection
        const response = await fetch('https://api.mercadopago.com/users/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          toast.success(`Conexão OK! Conta: ${data.email || data.nickname}`);
          // Update last validated
          handleChange('paymentGateway', {
            ...settings.paymentGateway,
            lastValidatedAt: new Date().toISOString(),
          });
        } else {
          toast.error('Token inválido ou expirado');
        }
      } else {
        // Generic test - just check if token is not empty
        toast.success('Credenciais configuradas (validação manual necessária)');
      }
    } catch (error) {
      toast.error('Erro ao testar conexão. Verifique sua rede.');
    }
    setTestingConnection(false);
  };

  const handleClearGatewayConfig = () => {
    if (!settings) return;
    handleChange('paymentGateway', {
      provider: undefined,
      mode: 'sandbox',
      accessToken: undefined,
      userId: undefined,
      externalPosId: undefined,
      terminalId: undefined,
      storeId: undefined,
      enabledMethods: undefined,
      pollingIntervalMs: undefined,
      pollingMaxAttempts: undefined,
      configuredAt: undefined,
      lastValidatedAt: undefined,
    });
    toast.success('Configuração do gateway limpa');
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

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

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CreditCard className="h-5 w-5 mr-2" />
            Métodos de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Aceitar Dinheiro</Label>
              <p className="text-sm text-gray-500">Permitir pagamento em dinheiro</p>
            </div>
            <Switch
              checked={settings.acceptCash ?? true}
              onCheckedChange={(v) => handleChange('acceptCash', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Aceitar Cartão</Label>
              <p className="text-sm text-gray-500">Crédito e débito</p>
            </div>
            <Switch
              checked={settings.acceptCard ?? true}
              onCheckedChange={(v) => handleChange('acceptCard', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Aceitar PIX</Label>
              <p className="text-sm text-gray-500">Pagamento instantâneo</p>
            </div>
            <Switch
              checked={settings.acceptPix ?? true}
              onCheckedChange={(v) => handleChange('acceptPix', v)}
            />
          </div>
          {settings.acceptPix && (
            <div>
              <Label>Chave PIX</Label>
              <Input
                value={settings.pixKey || ''}
                onChange={(e) => handleChange('pixKey', e.target.value)}
                placeholder="CPF, CNPJ, e-mail ou chave aleatória"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Gateway */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Gateway de Pagamento
              </CardTitle>
              <CardDescription>
                Configure a integração com processador de pagamentos
              </CardDescription>
            </div>
            {settings.paymentGateway?.provider && settings.paymentGateway.provider !== 'none' && (
              <Badge variant={settings.paymentGateway?.configuredAt ? 'default' : 'secondary'}>
                {settings.paymentGateway?.configuredAt ? 'Configurado' : 'Pendente'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider and Mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Provedor</Label>
              <Select
                value={settings.paymentGateway?.provider || 'none'}
                onValueChange={(v) => handleChange('paymentGateway', { 
                  ...settings.paymentGateway, 
                  provider: v === 'none' ? undefined : v 
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o provedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  <SelectItem value="stone">Stone</SelectItem>
                  <SelectItem value="cielo">Cielo</SelectItem>
                  <SelectItem value="pagseguro">PagSeguro</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ambiente</Label>
              <Select
                value={settings.paymentGateway?.mode || 'sandbox'}
                onValueChange={(v) => handleChange('paymentGateway', { 
                  ...settings.paymentGateway, 
                  mode: v as 'sandbox' | 'production' 
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

          {settings.paymentGateway?.mode === 'production' && (
            <Alert className="border-yellow-500 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Modo produção ativo. As transações serão processadas com valores reais.
              </AlertDescription>
            </Alert>
          )}

          {settings.paymentGateway?.provider && settings.paymentGateway.provider !== 'none' && (
            <>
              {/* Payment Methods (Switches) */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Métodos de Pagamento</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>PIX</Label>
                      <p className="text-xs text-gray-500">QR Code instantâneo</p>
                    </div>
                    <Switch
                      checked={settings.paymentGateway?.enabledMethods?.pix ?? true}
                      onCheckedChange={(v) => handleChange('paymentGateway', { 
                        ...settings.paymentGateway, 
                        enabledMethods: { ...settings.paymentGateway?.enabledMethods, pix: v }
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Crédito</Label>
                      <p className="text-xs text-gray-500">Cartão de crédito</p>
                    </div>
                    <Switch
                      checked={settings.paymentGateway?.enabledMethods?.credit ?? true}
                      onCheckedChange={(v) => handleChange('paymentGateway', { 
                        ...settings.paymentGateway, 
                        enabledMethods: { ...settings.paymentGateway?.enabledMethods, credit: v }
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Débito</Label>
                      <p className="text-xs text-gray-500">Cartão de débito</p>
                    </div>
                    <Switch
                      checked={settings.paymentGateway?.enabledMethods?.debit ?? true}
                      onCheckedChange={(v) => handleChange('paymentGateway', { 
                        ...settings.paymentGateway, 
                        enabledMethods: { ...settings.paymentGateway?.enabledMethods, debit: v }
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* Credentials */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Credenciais</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Access Token</Label>
                    <div className="relative">
                      <Input
                        type={showAccessToken ? 'text' : 'password'}
                        value={settings.paymentGateway?.accessToken || ''}
                        onChange={(e) => handleChange('paymentGateway', { 
                          ...settings.paymentGateway, 
                          accessToken: e.target.value 
                        })}
                        placeholder="APP_USR-..."
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowAccessToken(!showAccessToken)}
                      >
                        {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {settings.paymentGateway.mode === 'production' 
                        ? '⚠️ Ambiente de produção - transações reais'
                        : '🧪 Ambiente de testes - sem transações reais'}
                    </p>
                  </div>
                  <div>
                    <Label>User ID</Label>
                    <Input
                      value={settings.paymentGateway?.userId || ''}
                      onChange={(e) => handleChange('paymentGateway', { 
                        ...settings.paymentGateway, 
                        userId: e.target.value 
                      })}
                      placeholder="ID do usuário no gateway"
                    />
                  </div>
                  <div>
                    <Label>External POS ID</Label>
                    <Input
                      value={settings.paymentGateway?.externalPosId || ''}
                      onChange={(e) => handleChange('paymentGateway', { 
                        ...settings.paymentGateway, 
                        externalPosId: e.target.value 
                      })}
                      placeholder="Ex: KIOSK-001"
                    />
                    <p className="text-xs text-gray-500 mt-1">Identificador único do terminal</p>
                  </div>
                  <div>
                    <Label>Store ID (Gateway)</Label>
                    <Input
                      value={settings.paymentGateway?.storeId || ''}
                      onChange={(e) => handleChange('paymentGateway', { 
                        ...settings.paymentGateway, 
                        storeId: e.target.value 
                      })}
                      placeholder="ID da loja no gateway"
                    />
                  </div>
                </div>
              </div>

              {/* Terminal ID (for physical card readers) */}
              <div>
                <Label>Terminal ID</Label>
                <Input
                  value={settings.paymentGateway?.terminalId || ''}
                  onChange={(e) => handleChange('paymentGateway', { 
                    ...settings.paymentGateway, 
                    terminalId: e.target.value 
                  })}
                  placeholder="Ex: GERTEC_MP35P__12345"
                />
                <p className="text-xs text-gray-500 mt-1">ID do terminal físico para pagamentos com cartão</p>
              </div>

              {/* Advanced Settings - Collapsible */}
              <details className="border rounded-lg p-4">
                <summary className="cursor-pointer font-medium">Configurações Avançadas</summary>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Polling Interval (ms)</Label>
                    <Input
                      type="number"
                      value={settings.paymentGateway?.pollingIntervalMs || 3000}
                      onChange={(e) => handleChange('paymentGateway', { 
                        ...settings.paymentGateway, 
                        pollingIntervalMs: Number(e.target.value) 
                      })}
                      min={1000}
                      max={10000}
                    />
                    <p className="text-xs text-gray-500 mt-1">Intervalo para verificar status do pagamento</p>
                  </div>
                  <div>
                    <Label>Máximo de Tentativas</Label>
                    <Input
                      type="number"
                      value={settings.paymentGateway?.pollingMaxAttempts || 45}
                      onChange={(e) => handleChange('paymentGateway', { 
                        ...settings.paymentGateway, 
                        pollingMaxAttempts: Number(e.target.value) 
                      })}
                      min={10}
                      max={120}
                    />
                    <p className="text-xs text-gray-500 mt-1">Número máximo de verificações</p>
                  </div>
                </div>
              </details>

              {/* Configuration Metadata */}
              {settings.paymentGateway?.configuredAt && (
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                  <p>Configurado em: {new Date(settings.paymentGateway.configuredAt).toLocaleString('pt-BR')}</p>
                  {settings.paymentGateway.lastValidatedAt && (
                    <p>Última validação: {new Date(settings.paymentGateway.lastValidatedAt).toLocaleString('pt-BR')}</p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !settings.paymentGateway?.accessToken}
                >
                  {testingConnection ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
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
