import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Store, Database, Copy, Upload, Clipboard, Check, Loader2 } from "lucide-react";
import { StoreSettings } from "@/types/store";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";
import { storeService } from "@/services/storeService";
import { loadEnvironmentConfig, mergeWithDefaults } from "@/services/environmentConfigLoader";
import { setupKioskController } from "@/services/setupKioskController";
import { useConfigImport } from "@/hooks/useConfigImport";

interface StoreInitializationProps {
  onComplete: (settings: StoreSettings) => void;
}

const StoreInitialization = ({ onComplete }: StoreInitializationProps) => {
  const { t } = useTranslation();
  
  // Estado padrão inicial
  const defaultSettings: StoreSettings = {
    storeId: "",
    name: "",
    currency: "INR",
    taxId: "",
    taxPercentage: 18,
    comPort: "",
    firebaseConfig: {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    }
  };
  
  const [settings, setSettings] = useState<StoreSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreloading, setIsPreloading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Hook para import/export de configurações
  const { handleFileImport, handleClipboardImport, handleCopyToClipboard } = useConfigImport();

  // Pré-carregar configurações ao montar o componente
  useEffect(() => {
    const loadPrefilledConfig = async () => {
      try {
        console.log('[StoreInitialization] Tentando pré-carregar configurações...');
        const envConfig = await loadEnvironmentConfig();
        
        if (envConfig) {
          const mergedSettings = mergeWithDefaults(envConfig, defaultSettings);
          setSettings(mergedSettings);
          
          toast({
            title: "Configurações Carregadas",
            description: "Dados pré-preenchidos do arquivo de configuração"
          });
          
          console.log('[StoreInitialization] ✅ Config pré-carregada com sucesso');
        } else {
          console.log('[StoreInitialization] Nenhuma config encontrada, usando valores padrão');
        }
      } catch (error) {
        console.warn('[StoreInitialization] Erro ao carregar config:', error);
        // Não mostrar erro ao usuário, simplesmente usar valores padrão
      } finally {
        setIsPreloading(false);
      }
    };
    
    loadPrefilledConfig();
  }, []);

  // Handler para importar arquivo JSON
  const onFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const config = await handleFileImport(file);
    if (config) {
      const mergedSettings = mergeWithDefaults(config, settings);
      setSettings(mergedSettings);
    }
    
    // Limpar input para permitir re-seleção do mesmo arquivo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handler para colar JSON do clipboard
  const onPasteConfig = async () => {
    const config = await handleClipboardImport();
    if (config) {
      const mergedSettings = mergeWithDefaults(config, settings);
      setSettings(mergedSettings);
    }
  };

  // Handler para copiar campo individual
  const onCopyField = async (value: string, fieldName: string) => {
    const success = await handleCopyToClipboard(value, fieldName);
    if (success) {
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFirebaseConfigChange = (field: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      firebaseConfig: {
        ...prev.firebaseConfig,
        [field]: value
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate required fields
      if (!settings.storeId || !settings.name || !settings.taxId || !settings.firebaseConfig.projectId || !settings.firebaseConfig.apiKey) {
        toast({
          title: t('common.error'),
          description: t('setup.fillRequired'),
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // Validate storeId length
      if (settings.storeId.length < 3 || settings.storeId.length > 50) {
        toast({
          title: t('common.error'),
          description: "Store ID deve ter entre 3 e 50 caracteres",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // Validate storeId format (alphanumeric, dashes, underscores only)
      const storeIdRegex = /^[a-zA-Z0-9_-]+$/;
      if (!storeIdRegex.test(settings.storeId)) {
        toast({
          title: t('common.error'),
          description: "Store ID deve conter apenas letras, números, - e _",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // Save to localStorage for persistence
      localStorage.setItem('storeSettings', JSON.stringify(settings));
      localStorage.setItem('storeInitialized', 'true');
      localStorage.setItem('currentStoreId', settings.storeId);

      // Create store document in Firestore (after Firebase is initialized by App)
      // This will be done on first use via ensureStoreExists
      try {
        await storeService.ensureStoreExists(
          settings.storeId,
          settings.name,
          settings.currency,
          settings.taxId,
          settings.taxPercentage || 0
        );
      } catch (storeError) {
        console.warn('Could not create store document (Firebase may not be initialized yet):', storeError);
        // Continue anyway - store will be created on first access
      }

      toast({
        title: t('common.success'),
        description: t('setup.setupComplete')
      });

      // ✅ ATIVAR MODO KIOSK após setup completo
      // Isso trava a tela no app, impedindo que o usuário saia
      console.log('[StoreInitialization] Setup completo, ativando modo kiosk...');
      await setupKioskController.completeSetupAndEnterKiosk();

      onComplete(settings);
    } catch (error) {
      console.error('Setup error:', error);
      toast({
        title: t('common.error'),
        description: t('setup.setupFailed'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Store className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">{t('setup.storeSetup')}</CardTitle>
          <p className="text-gray-600">{t('setup.setupDescription')}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">{t('setup.storeInformation')}</h3>
              
              <div>
                <Label htmlFor="storeId">{t('setup.storeId')} *</Label>
                <Input
                  id="storeId"
                  value={settings.storeId || ""}
                  onChange={(e) => handleInputChange('storeId', e.target.value.toLowerCase().replace(/\s/g, '-'))}
                  placeholder="minha-loja-01"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('setup.storeIdHelp')}
                </p>
              </div>

              <div>
                <Label htmlFor="storeName">{t('setup.storeName')} *</Label>
                <Input
                  id="storeName"
                  value={settings.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder={t('setup.storeNamePlaceholder')}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="currency">{t('setup.currency')}</Label>
                  <Input
                    id="currency"
                    value={settings.currency}
                    onChange={(e) => handleInputChange('currency', e.target.value)}
                    placeholder="INR"
                  />
                </div>
                <div>
                  <Label htmlFor="taxPercentage">{t('setup.taxPercentage')}</Label>
                  <Input
                    id="taxPercentage"
                    type="number"
                    value={settings.taxPercentage}
                    onChange={(e) => handleInputChange('taxPercentage', parseFloat(e.target.value) || 0)}
                    placeholder="18"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="taxId">{t('setup.taxIdGst')} *</Label>
                <Input
                  id="taxId"
                  value={settings.taxId}
                  onChange={(e) => handleInputChange('taxId', e.target.value)}
                  placeholder={t('setup.taxIdPlaceholder')}
                  required
                />
              </div>

              <div>
                <Label htmlFor="comPort">{t('setup.comPortPrinter')}</Label>
                <Input
                  id="comPort"
                  value={settings.comPort || ""}
                  onChange={(e) => handleInputChange('comPort', e.target.value)}
                  placeholder={t('setup.comPortPlaceholder')}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('setup.comPortHelp')}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center">
                <Database className="w-5 h-5 mr-2" />
                {t('setup.firebaseConfig')} *
              </h3>
              
              {/* Botões de Import/Paste para facilitar entrada de credenciais */}
              <div className="flex flex-wrap gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={onFileImport}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Importar Arquivo JSON
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onPasteConfig}
                  className="flex items-center gap-2"
                >
                  <Clipboard className="w-4 h-4" />
                  Colar JSON do Clipboard
                </Button>
                <p className="w-full text-xs text-blue-600 mt-1">
                  💡 Dica: Importe um arquivo JSON com suas credenciais ou cole do clipboard para preencher automaticamente.
                </p>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="apiKey">{t('setup.apiKey')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="apiKey"
                      value={settings.firebaseConfig.apiKey}
                      onChange={(e) => handleFirebaseConfigChange('apiKey', e.target.value)}
                      placeholder={t('setup.apiKeyPlaceholder')}
                      required
                      className="flex-1"
                    />
                    {settings.firebaseConfig.apiKey && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => onCopyField(settings.firebaseConfig.apiKey, 'API Key')}
                        title="Copiar API Key"
                      >
                        {copiedField === 'API Key' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="projectId">{t('setup.projectId')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="projectId"
                      value={settings.firebaseConfig.projectId}
                      onChange={(e) => handleFirebaseConfigChange('projectId', e.target.value)}
                      placeholder={t('setup.projectIdPlaceholder')}
                      required
                      className="flex-1"
                    />
                    {settings.firebaseConfig.projectId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => onCopyField(settings.firebaseConfig.projectId, 'Project ID')}
                        title="Copiar Project ID"
                      >
                        {copiedField === 'Project ID' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="authDomain">{t('setup.authDomain')}</Label>
                  <Input
                    id="authDomain"
                    value={settings.firebaseConfig.authDomain}
                    onChange={(e) => handleFirebaseConfigChange('authDomain', e.target.value)}
                    placeholder={t('setup.authDomainPlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="storageBucket">{t('setup.storageBucket')}</Label>
                    <Input
                      id="storageBucket"
                      value={settings.firebaseConfig.storageBucket}
                      onChange={(e) => handleFirebaseConfigChange('storageBucket', e.target.value)}
                      placeholder={t('setup.storageBucketPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="messagingSenderId">{t('setup.messagingSenderId')}</Label>
                    <Input
                      id="messagingSenderId"
                      value={settings.firebaseConfig.messagingSenderId}
                      onChange={(e) => handleFirebaseConfigChange('messagingSenderId', e.target.value)}
                      placeholder={t('setup.messagingSenderIdPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="appId">{t('setup.appId')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="appId"
                      value={settings.firebaseConfig.appId}
                      onChange={(e) => handleFirebaseConfigChange('appId', e.target.value)}
                      placeholder={t('setup.appIdPlaceholder')}
                      className="flex-1"
                    />
                    {settings.firebaseConfig.appId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => onCopyField(settings.firebaseConfig.appId, 'App ID')}
                        title="Copiar App ID"
                      >
                        {copiedField === 'App ID' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isLoading || isPreloading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('setup.settingUp')}
                </>
              ) : isPreloading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Carregando...
                </>
              ) : (
                t('setup.completeSetup')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreInitialization;
