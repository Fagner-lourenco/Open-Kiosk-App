/**
 * Admin Payment Gateway Hub
 * 
 * Painel de configuração de gateways de pagamento.
 * Permite configurar credenciais, modo (sandbox/production),
 * e testar conexão com o provedor.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { 
  CreditCard, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Eye,
  EyeOff,
  ChevronDown,
  Zap,
  Settings2,
  Shield,
  Wifi
} from "lucide-react";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useTranslation } from "@/i18n";
import { toast } from "sonner";
import { createMercadoPagoAPI } from "@/services/mercadopagoAPI";
import { validatePaymentConfig, getPaymentConfig } from "@/config/paymentGateway";
import type { PaymentGatewayConfig, PaymentProvider } from "@/types/store";

export default function AdminPaymentGatewayHub() {
  const { settings, updateSettings } = useStoreSettings();
  const { t } = useTranslation();

  // Estado do formulário
  const [provider, setProvider] = useState<PaymentProvider>('mercadopago');
  const [mode, setMode] = useState<'sandbox' | 'production'>('sandbox');
  const [accessToken, setAccessToken] = useState('');
  const [userId, setUserId] = useState('');
  const [externalPosId, setExternalPosId] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [storeId, setStoreId] = useState('');
  
  // Métodos de pagamento habilitados
  const [enablePix, setEnablePix] = useState(true);
  const [enableCredit, setEnableCredit] = useState(true);
  const [enableDebit, setEnableDebit] = useState(true);
  
  // Timeouts customizáveis
  const [pollingIntervalMs, setPollingIntervalMs] = useState(3000);
  const [pollingMaxAttempts, setPollingMaxAttempts] = useState(45);
  const [pointExpirationTime, setPointExpirationTime] = useState('PT2M');
  
  // Estado da UI
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Carregar configuração existente
  useEffect(() => {
    if (settings?.paymentGatewayConfig) {
      const config = settings.paymentGatewayConfig;
      setProvider(config.provider || 'mercadopago');
      setMode(config.mode || 'sandbox');
      setAccessToken(config.accessToken || '');
      setUserId(config.userId || '');
      setExternalPosId(config.externalPosId || '');
      setTerminalId(config.terminalId || '');
      setStoreId(config.storeId || '');
      setPollingIntervalMs(config.pollingIntervalMs || 3000);
      setPollingMaxAttempts(config.pollingMaxAttempts || 45);
      setPointExpirationTime(config.pointExpirationTime || 'PT2M');
      // Métodos de pagamento (default true para compatibilidade)
      setEnablePix(config.enabledMethods?.pix ?? true);
      setEnableCredit(config.enabledMethods?.credit ?? true);
      setEnableDebit(config.enabledMethods?.debit ?? true);
    }
  }, [settings?.paymentGatewayConfig]);

  // Detectar mudanças
  useEffect(() => {
    const current = settings?.paymentGatewayConfig;
    const changed = 
      provider !== (current?.provider || 'mercadopago') ||
      mode !== (current?.mode || 'sandbox') ||
      accessToken !== (current?.accessToken || '') ||
      userId !== (current?.userId || '') ||
      externalPosId !== (current?.externalPosId || '') ||
      terminalId !== (current?.terminalId || '') ||
      storeId !== (current?.storeId || '') ||
      enablePix !== (current?.enabledMethods?.pix ?? true) ||
      enableCredit !== (current?.enabledMethods?.credit ?? true) ||
      enableDebit !== (current?.enabledMethods?.debit ?? true);
    setHasChanges(changed);
  }, [provider, mode, accessToken, userId, externalPosId, terminalId, storeId, enablePix, enableCredit, enableDebit, settings?.paymentGatewayConfig]);

  // Testar conexão
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setTestMessage('');

    try {
      // Validar campos obrigatórios
      if (!accessToken) {
        throw new Error('Access Token é obrigatório');
      }

      // Criar API com credenciais do formulário
      const api = createMercadoPagoAPI({
        accessToken,
        mode,
      });

      if (!api) {
        throw new Error('Não foi possível criar cliente da API');
      }

      // Testar listando terminais
      const response = await api.listTerminals({ limit: 5 });
      
      const terminalsCount = response.data?.terminals?.length || 0;
      setTestResult('success');
      setTestMessage(`Conexão estabelecida! ${terminalsCount} terminal(is) encontrado(s).`);
      
      toast.success('Conexão com Mercado Pago estabelecida!');
    } catch (error) {
      console.error('[PaymentGatewayHub] Erro ao testar conexão:', error);
      setTestResult('error');
      setTestMessage(error instanceof Error ? error.message : 'Erro desconhecido');
      toast.error('Falha ao conectar com Mercado Pago');
    } finally {
      setTesting(false);
    }
  };

  // Salvar configuração
  const handleSave = async () => {
    setSaving(true);

    try {
      // Validar campos obrigatórios
      const tempConfig: PaymentGatewayConfig = {
        provider,
        mode,
        accessToken,
        userId,
        externalPosId,
        terminalId: terminalId || undefined,
        storeId: storeId || undefined,
        pollingIntervalMs,
        pollingMaxAttempts,
        pointExpirationTime,
        enabledMethods: {
          pix: enablePix,
          credit: enableCredit,
          debit: enableDebit,
        },
        configuredAt: new Date().toISOString(),
      };

      const validation = validatePaymentConfig(tempConfig);
      
      if (!validation.valid) {
        toast.error('Configuração inválida: ' + validation.errors.join(', '));
        return;
      }

      // Avisos (não bloqueiam)
      if (validation.warnings.length > 0) {
        validation.warnings.forEach(w => toast.warning(w));
      }

      // Salvar
      if (settings) {
        await updateSettings({
          ...settings,
          paymentGatewayConfig: tempConfig,
        });
        
        setHasChanges(false);
        toast.success('Configuração de pagamento salva com sucesso!');
      }
    } catch (error) {
      console.error('[PaymentGatewayHub] Erro ao salvar:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  // Limpar configuração
  const handleClear = async () => {
    if (!confirm('Tem certeza que deseja limpar a configuração? O sistema usará as variáveis de ambiente.')) {
      return;
    }

    try {
      if (settings) {
        const { paymentGatewayConfig, ...rest } = settings;
        await updateSettings(rest as typeof settings);
        
        // Limpar formulário
        setAccessToken('');
        setUserId('');
        setExternalPosId('');
        setTerminalId('');
        setStoreId('');
        setMode('sandbox');
        setEnablePix(true);
        setEnableCredit(true);
        setEnableDebit(true);
        setHasChanges(false);
        setTestResult(null);
        
        toast.success('Configuração limpa. Usando variáveis de ambiente.');
      }
    } catch (error) {
      console.error('[PaymentGatewayHub] Erro ao limpar:', error);
      toast.error('Erro ao limpar configuração');
    }
  };

  // Máscara para token
  const maskedToken = accessToken 
    ? `${'•'.repeat(Math.max(0, accessToken.length - 8))}${accessToken.slice(-8)}`
    : '';

  // Status atual
  const currentConfig = getPaymentConfig(settings?.paymentGatewayConfig);
  const isUsingFirestore = !!settings?.paymentGatewayConfig?.accessToken;
  const isUsingEnvVars = !isUsingFirestore && !!currentConfig.accessToken;

  return (
    <div className="space-y-6">
      {/* Header com Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Gateway de Pagamentos
              </CardTitle>
              <CardDescription className="mt-1">
                Configure o provedor de pagamentos para PIX e cartões
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isUsingFirestore && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Configurado
                </Badge>
              )}
              {isUsingEnvVars && (
                <Badge variant="secondary">
                  <Settings2 className="h-3 w-3 mr-1" />
                  Usando Env Vars
                </Badge>
              )}
              {!isUsingFirestore && !isUsingEnvVars && (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Não Configurado
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Provedor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Provedor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provedor de Pagamento</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as PaymentProvider)}>
              <SelectTrigger id="provider">
                <SelectValue placeholder="Selecione o provedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mercadopago">
                  <span className="flex items-center gap-2">
                    💳 Mercado Pago
                  </span>
                </SelectItem>
                <SelectItem value="stone" disabled>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    🪨 Stone (Em breve)
                  </span>
                </SelectItem>
                <SelectItem value="pagseguro" disabled>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    💚 PagSeguro (Em breve)
                  </span>
                </SelectItem>
                <SelectItem value="cielo" disabled>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    🔵 Cielo (Em breve)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="mode">Modo de Operação</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as 'sandbox' | 'production')}>
              <SelectTrigger id="mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">
                  <span className="flex items-center gap-2">
                    🧪 Sandbox (Testes)
                  </span>
                </SelectItem>
                <SelectItem value="production">
                  <span className="flex items-center gap-2">
                    🚀 Produção
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {mode === 'production' && (
              <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Modo Produção</AlertTitle>
                <AlertDescription>
                  Transações reais serão processadas. Certifique-se de usar credenciais corretas.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Métodos de Pagamento Habilitados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {t('admin.paymentMethods')}
          </CardTitle>
          <CardDescription>
            Selecione quais métodos de pagamento estarão disponíveis no checkout
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enablePix" className="text-base">{t('admin.enablePix')}</Label>
              <p className="text-sm text-muted-foreground">Pagamento instantâneo via QR Code</p>
            </div>
            <Switch
              id="enablePix"
              checked={enablePix}
              onCheckedChange={setEnablePix}
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enableCredit" className="text-base">{t('admin.enableCredit')}</Label>
              <p className="text-sm text-muted-foreground">Visa, Mastercard, Elo - até 12x</p>
            </div>
            <Switch
              id="enableCredit"
              checked={enableCredit}
              onCheckedChange={setEnableCredit}
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enableDebit" className="text-base">{t('admin.enableDebit')}</Label>
              <p className="text-sm text-muted-foreground">Débito instantâneo na conta</p>
            </div>
            <Switch
              id="enableDebit"
              checked={enableDebit}
              onCheckedChange={setEnableDebit}
            />
          </div>
          
          {!enablePix && !enableCredit && !enableDebit && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Atenção</AlertTitle>
              <AlertDescription>
                {t('admin.noPaymentMethodsEnabled')}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Credenciais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Credenciais Mercado Pago
          </CardTitle>
          <CardDescription>
            Obtenha as credenciais em{' '}
            <a 
              href="https://www.mercadopago.com.br/developers/panel/credentials" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Mercado Pago Developers
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Access Token */}
          <div className="space-y-2">
            <Label htmlFor="accessToken">Access Token *</Label>
            <div className="relative">
              <Input
                id="accessToken"
                type={showToken ? 'text' : 'password'}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="APP_USR-..."
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Token de acesso para {mode === 'production' ? 'produção' : 'sandbox'}
            </p>
          </div>

          {/* User ID */}
          <div className="space-y-2">
            <Label htmlFor="userId">User ID *</Label>
            <Input
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="123456789"
            />
            <p className="text-xs text-muted-foreground">
              ID do usuário Mercado Pago (número)
            </p>
          </div>

          {/* External POS ID */}
          <div className="space-y-2">
            <Label htmlFor="externalPosId">External POS ID *</Label>
            <Input
              id="externalPosId"
              value={externalPosId}
              onChange={(e) => setExternalPosId(e.target.value)}
              placeholder="KIOSK001"
            />
            <p className="text-xs text-muted-foreground">
              Identificador externo do ponto de venda
            </p>
          </div>

          {/* Terminal ID (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="terminalId">Terminal ID (opcional)</Label>
            <Input
              id="terminalId"
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              placeholder="GERTEC_MP35P__XXXXXXXX"
            />
            <p className="text-xs text-muted-foreground">
              ID do terminal Point. Se vazio, será detectado automaticamente.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Configurações Avançadas */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Configurações Avançadas
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Store ID */}
              <div className="space-y-2">
                <Label htmlFor="storeId">Store ID (opcional)</Label>
                <Input
                  id="storeId"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  placeholder="12345678"
                />
              </div>

              <Separator />

              {/* Timeouts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pollingInterval">Polling Interval (ms)</Label>
                  <Input
                    id="pollingInterval"
                    type="number"
                    min={1000}
                    max={10000}
                    step={500}
                    value={pollingIntervalMs}
                    onChange={(e) => setPollingIntervalMs(parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pollingAttempts">Max Tentativas</Label>
                  <Input
                    id="pollingAttempts"
                    type="number"
                    min={10}
                    max={100}
                    value={pollingMaxAttempts}
                    onChange={(e) => setPollingMaxAttempts(parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pointExpiration">Point Expiration</Label>
                  <Select value={pointExpirationTime} onValueChange={setPointExpirationTime}>
                    <SelectTrigger id="pointExpiration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PT1M">1 minuto</SelectItem>
                      <SelectItem value="PT2M">2 minutos</SelectItem>
                      <SelectItem value="PT3M">3 minutos</SelectItem>
                      <SelectItem value="PT5M">5 minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Resultado do Teste */}
      {testResult && (
        <Alert variant={testResult === 'success' ? 'default' : 'destructive'}>
          {testResult === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertTitle>
            {testResult === 'success' ? 'Conexão Bem Sucedida' : 'Falha na Conexão'}
          </AlertTitle>
          <AlertDescription>{testMessage}</AlertDescription>
        </Alert>
      )}

      {/* Ações */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleTestConnection}
              variant="outline"
              disabled={testing || !accessToken}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4 mr-2" />
              )}
              Testar Conexão
            </Button>

            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges || !accessToken || !userId || !externalPosId}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Salvar Configuração
            </Button>

            {isUsingFirestore && (
              <Button
                onClick={handleClear}
                variant="destructive"
                disabled={saving}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Limpar Config
              </Button>
            )}
          </div>

          {hasChanges && (
            <p className="text-sm text-amber-600 mt-3">
              ⚠️ Você tem alterações não salvas
            </p>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <strong>Segurança:</strong> Credenciais são armazenadas de forma segura no Firestore.
            </p>
            <p className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              <strong>Fallback:</strong> Se não houver configuração, o sistema usa variáveis de ambiente.
            </p>
            <p className="flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              <strong>Offline:</strong> Configuração é cacheada localmente para funcionamento offline.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
