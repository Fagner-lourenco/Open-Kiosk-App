import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings, Globe, Usb, Wifi, Bluetooth, Zap, Trash2, Beer, Volume2, Printer, Video, Store, MonitorPlay } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useLanguage, useTranslation } from "@/i18n";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Language } from "@/i18n";
import type { ESP32ConnectionType, AttractVideoSettings } from "@/types/store";
import { getFirebaseDb, getCurrentFranchiseId } from "@/services/firebase";
import { isFranchiseMode } from "@/lib/pathResolver";
import esp32Service from "@/services/esp32CommunicationService";

export default function AdminSettings() {
  const { currentCurrency, currencies, updateCurrency, loading } = useSettings();
  const { settings, updateSettings, loading: settingsLoading } = useStoreSettings();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  // ESP32 settings com defaults
  const esp32AutoConnect = settings?.esp32AutoConnect ?? true;
  const esp32ConnectionOrder = settings?.esp32ConnectionOrder ?? ['usb', 'wifi', 'bluetooth'];
  const esp32HeartbeatIntervalMs = settings?.esp32HeartbeatIntervalMs ?? 15000;
  
  // Drink Pickup settings com defaults
  const drinkPickupTimeoutSeconds = settings?.drinkPickupTimeoutSeconds ?? 90;
  const drinkPickupSoundEnabled = settings?.drinkPickupSoundEnabled ?? true;

  // Estado para configurações de vídeo de fundo
  const [attractVideoSettings, setAttractVideoSettings] = useState<AttractVideoSettings>({
    isEnabled: false,
    videoOpacity: 0.4,
    videoCoverMode: 'cover'
  });
  const [videoSaving, setVideoSaving] = useState(false);

  

  // Carregar configurações de vídeo do Firestore
  useEffect(() => {
    const loadAttractVideoSettings = async () => {
      try {
        if (!settings?.storeId) return;

        const db = getFirebaseDb();
        
        let videoDocRef;
        if (isFranchiseMode()) {
          const franchiseId = getCurrentFranchiseId();
          if (franchiseId) {
            videoDocRef = doc(db, 'franchises', franchiseId, 'stores', settings.storeId, 'settings', 'attract_video');
          } else {
            videoDocRef = doc(db, 'stores', settings.storeId, 'settings', 'attract_video');
          }
        } else {
          videoDocRef = doc(db, 'stores', settings.storeId, 'settings', 'attract_video');
        }
        
        const videoSnap = await getDoc(videoDocRef);

        if (videoSnap.exists()) {
          setAttractVideoSettings(videoSnap.data() as AttractVideoSettings);
        }
      } catch (error) {
        console.error('Error loading attract video settings:', error);
      }
    };

    loadAttractVideoSettings();
  }, [settings?.storeId]);

  const handleAttractVideoChange = (field: keyof AttractVideoSettings, value: string | number | boolean) => {
    setAttractVideoSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveVideoSettings = async () => {
    if (!settings?.storeId) return;
    
    setVideoSaving(true);
    try {
      const db = getFirebaseDb();
      
      let videoDocRef;
      if (isFranchiseMode()) {
        const franchiseId = getCurrentFranchiseId();
        if (franchiseId) {
          videoDocRef = doc(db, 'franchises', franchiseId, 'stores', settings.storeId, 'settings', 'attract_video');
        } else {
          videoDocRef = doc(db, 'stores', settings.storeId, 'settings', 'attract_video');
        }
      } else {
        videoDocRef = doc(db, 'stores', settings.storeId, 'settings', 'attract_video');
      }

      await setDoc(videoDocRef, attractVideoSettings, { merge: true });
      toast.success(t('settings.attractVideoSaved') || 'Configurações de vídeo salvas!');
    } catch (error) {
      console.error('Error saving attract video settings:', error);
      toast.error(t('common.error') || 'Erro ao salvar');
    } finally {
      setVideoSaving(false);
    }
  };

  const handleLanguageChange = async (newLanguage: Language) => {
    try {
      console.log('[AdminSettings] Mudando idioma para:', newLanguage);
      
      // Atualiza o contexto local primeiro (imediato)
      setLanguage(newLanguage);
      
      // Depois salva no Firebase para sincronizar entre dispositivos
      if (settings) {
        await updateSettings({ ...settings, language: newLanguage });
        console.log('[AdminSettings] Idioma salvo no Firebase:', newLanguage);
        toast.success(t('settings.languageChanged'));
      }
    } catch (error) {
      console.error('Erro ao salvar idioma no Firebase:', error);
      toast.error(t('common.error'));
    }
  };

  const handleAutoConnectChange = async (enabled: boolean) => {
    if (settings) {
      await updateSettings({ ...settings, esp32AutoConnect: enabled });
      toast.success(enabled ? t('esp32.autoConnect') + ' ativado' : t('esp32.autoConnect') + ' desativado');
    }
  };

  const handleConnectionOrderChange = async (order: ESP32ConnectionType[]) => {
    if (settings) {
      await updateSettings({ ...settings, esp32ConnectionOrder: order });
      toast.success(t('esp32.connectionOrder') + ' atualizado');
    }
  };

  const handleHeartbeatChange = async (intervalMs: number) => {
    if (settings && intervalMs >= 5000 && intervalMs <= 60000) {
      await updateSettings({ ...settings, esp32HeartbeatIntervalMs: intervalMs });
      toast.success(t('esp32.heartbeatInterval') + ': ' + intervalMs + 'ms');
    }
  };

  const handleClearLastConnection = () => {
    esp32Service.clearLastConnection();
    toast.success(t('esp32.lastConnectionCleared'));
  };

  const handlePickupTimeoutChange = async (seconds: number) => {
    if (settings && seconds >= 30 && seconds <= 300) {
      await updateSettings({ ...settings, drinkPickupTimeoutSeconds: seconds });
      toast.success(t('drinkPickup.timeoutUpdated') || `Timeout atualizado: ${seconds}s`);
    }
  };

  const handlePickupSoundChange = async (enabled: boolean) => {
    if (settings) {
      await updateSettings({ ...settings, drinkPickupSoundEnabled: enabled });
      toast.success(enabled 
        ? (t('drinkPickup.soundEnabled') || 'Som de confirmação ativado')
        : (t('drinkPickup.soundDisabled') || 'Som de confirmação desativado')
      );
    }
  };

  const moveConnectionOrder = (from: number, to: number) => {
    const newOrder = [...esp32ConnectionOrder];
    const [removed] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, removed);
    handleConnectionOrderChange(newOrder as ESP32ConnectionType[]);
  };

  const getConnectionIcon = (type: ESP32ConnectionType) => {
    switch (type) {
      case 'usb': return <Usb className="h-4 w-4" />;
      case 'wifi': return <Wifi className="h-4 w-4" />;
      case 'bluetooth': return <Bluetooth className="h-4 w-4" />;
    }
  };

  const getConnectionLabel = (type: ESP32ConnectionType) => {
    switch (type) {
      case 'usb': return 'USB Serial';
      case 'wifi': return 'WiFi';
      case 'bluetooth': return 'Bluetooth';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header - Configurações do Kiosk */}
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <MonitorPlay className="h-6 w-6" />
          {t('settings.kioskSettings') || 'Configurações do Kiosk'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('settings.kioskSettingsDescription') || 'Configurações operacionais do terminal de autoatendimento'}
        </p>
      </div>

      {/* Seletor de Idioma */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('settings.language')}
          </CardTitle>
          <CardDescription>
            {t('settings.languageDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="language-select">{t('settings.selectLanguage')}</Label>
            <Select value={language} onValueChange={(value) => handleLanguageChange(value as Language)}>
              <SelectTrigger id="language-select" className="w-full max-w-xs">
                <SelectValue placeholder={t('settings.selectLanguage')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">
                  <span className="flex items-center gap-2">
                    🇺🇸 English
                  </span>
                </SelectItem>
                <SelectItem value="pt-BR">
                  <span className="flex items-center gap-2">
                    🇧🇷 Português (Brasil)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Idioma atual: {language === 'pt-BR' ? '🇧🇷 Português (Brasil)' : '🇺🇸 English'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Configurações ESP32 Auto-Connect */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {t('esp32.autoConnectSettings')}
          </CardTitle>
          <CardDescription>
            {t('esp32.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle Autoconexão */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-connect">{t('esp32.enableAutoConnect')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('esp32.tryingToConnect')}
              </p>
            </div>
            <Switch
              id="auto-connect"
              checked={esp32AutoConnect}
              onCheckedChange={handleAutoConnectChange}
            />
          </div>

          {/* Ordem de Prioridade */}
          <div className="space-y-3">
            <div>
              <Label>{t('esp32.connectionOrder')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('esp32.connectionOrderDescription')}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {esp32ConnectionOrder.map((type, index) => (
                <div
                  key={type}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6">
                      {index + 1}.
                    </span>
                    {getConnectionIcon(type)}
                    <span className="font-medium">{getConnectionLabel(type)}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveConnectionOrder(index, Math.max(0, index - 1))}
                      disabled={index === 0}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveConnectionOrder(index, Math.min(esp32ConnectionOrder.length - 1, index + 1))}
                      disabled={index === esp32ConnectionOrder.length - 1}
                    >
                      ↓
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Intervalo de Heartbeat */}
          <div className="space-y-2">
            <Label htmlFor="heartbeat-interval">{t('esp32.heartbeatInterval')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('esp32.heartbeatDescription')}
            </p>
            <Input
              id="heartbeat-interval"
              type="number"
              min={5000}
              max={60000}
              step={1000}
              value={esp32HeartbeatIntervalMs}
              onChange={(e) => handleHeartbeatChange(parseInt(e.target.value) || 15000)}
              className="w-32"
            />
          </div>

          {/* Limpar Última Conexão */}
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearLastConnection}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {t('esp32.clearLastConnection')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configurações de Retirada de Bebida */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Beer className="h-5 w-5" />
            {t('drinkPickup.settingsTitle') || 'Retirada de Bebida'}
          </CardTitle>
          <CardDescription>
            {t('drinkPickup.settingsDescription') || 'Configure o tempo máximo para retirada e feedback sonoro'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timeout para iniciar retirada */}
          <div className="space-y-2">
            <Label htmlFor="pickup-timeout">
              {t('drinkPickup.timeoutLabel') || 'Tempo máximo para iniciar (segundos)'}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('drinkPickup.timeoutDescription') || 'Tempo que o usuário tem para posicionar o copo e abrir a torneira antes da sessão expirar'}
            </p>
            <Input
              id="pickup-timeout"
              type="number"
              min={30}
              max={300}
              step={10}
              value={drinkPickupTimeoutSeconds}
              onChange={(e) => handlePickupTimeoutChange(parseInt(e.target.value) || 90)}
              className="w-32"
            />
          </div>

          {/* Som de confirmação */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="pickup-sound" className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                {t('drinkPickup.soundLabel') || 'Som de confirmação'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('drinkPickup.soundDescription') || 'Reproduz um som ao concluir a dispensação da bebida'}
              </p>
            </div>
            <Switch
              id="pickup-sound"
              checked={drinkPickupSoundEnabled}
              onCheckedChange={handlePickupSoundChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Configurações de Impressora */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {t('settings.printer')}
          </CardTitle>
          <CardDescription>
            {t('settings.printerDescription') || 'Configure a impressora para recibos'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="thermalPrinter">{t('settings.useThermalPrinter')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.thermalPrinterDescription')}
              </p>
            </div>
            <Switch
              id="thermalPrinter"
              checked={settings?.useThermalPrinter || false}
              onCheckedChange={(checked) => settings && updateSettings({ ...settings, useThermalPrinter: checked })}
            />
          </div>

          {settings?.useThermalPrinter && (
            <div>
              <Label htmlFor="comPort">{t('settings.comPortThermal')}</Label>
              <Input
                id="comPort"
                value={settings?.comPort || ""}
                onChange={(e) => settings && updateSettings({ ...settings, comPort: e.target.value })}
                placeholder={t('settings.comPortPlaceholder')}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.comPortHelp')}
              </p>
            </div>
          )}

          {!settings?.useThermalPrinter && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-blue-800 text-sm">
                {t('settings.pdfModeDescription')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configurações de Vídeo de Fundo (Tela de Espera) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {t('settings.attractVideoTitle')}
          </CardTitle>
          <CardDescription>
            {t('settings.attractVideoDescription') || 'Configure o vídeo de fundo para a tela de espera do Kiosk'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggle para habilitar/desabilitar */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="videoEnabled">{t('settings.enableAttractVideo')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.enableAttractVideoDescription')}
              </p>
            </div>
            <Switch
              id="videoEnabled"
              checked={attractVideoSettings.isEnabled || false}
              onCheckedChange={(checked) => handleAttractVideoChange('isEnabled', checked)}
            />
          </div>

          {/* Campos de vídeo apenas se habilitado */}
          {attractVideoSettings.isEnabled && (
            <div className="space-y-4 border-t pt-4">
              {/* URL do vídeo */}
              <div>
                <Label htmlFor="videoUrl">{t('settings.videoUrl')} *</Label>
                <Input
                  id="videoUrl"
                  type="url"
                  value={attractVideoSettings.videoUrl || ""}
                  onChange={(e) => handleAttractVideoChange('videoUrl', e.target.value)}
                  placeholder={t('settings.videoUrlPlaceholder')}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.videoUrlHelp')}
                </p>
              </div>

              {/* Título customizado */}
              <div>
                <Label htmlFor="displayTitle">{t('settings.displayTitle')}</Label>
                <Input
                  id="displayTitle"
                  value={attractVideoSettings.displayTitle || ""}
                  onChange={(e) => handleAttractVideoChange('displayTitle', e.target.value)}
                  placeholder={t('settings.displayTitlePlaceholder')}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.displayTitleHelp')}
                </p>
              </div>

              {/* Subtítulo customizado */}
              <div>
                <Label htmlFor="displaySubtitle">{t('settings.displaySubtitle')}</Label>
                <Input
                  id="displaySubtitle"
                  value={attractVideoSettings.displaySubtitle || ""}
                  onChange={(e) => handleAttractVideoChange('displaySubtitle', e.target.value)}
                  placeholder={t('settings.displaySubtitlePlaceholder')}
                />
              </div>

              {/* Opacidade do vídeo */}
              <div>
                <Label htmlFor="videoOpacity">
                  {t('settings.videoOpacity')} ({Math.round((attractVideoSettings.videoOpacity || 0.4) * 100)}%)
                </Label>
                <input
                  id="videoOpacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={attractVideoSettings.videoOpacity || 0.4}
                  onChange={(e) => handleAttractVideoChange('videoOpacity', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.videoOpacityHelp')}
                </p>
              </div>

              {/* Modo de preenchimento */}
              <div>
                <Label htmlFor="coverMode">{t('settings.videoCoverMode')}</Label>
                <Select
                  value={attractVideoSettings.videoCoverMode || 'cover'}
                  onValueChange={(value) => handleAttractVideoChange('videoCoverMode', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">{t('settings.videoCoverModeFullScreen')}</SelectItem>
                    <SelectItem value="contain">{t('settings.videoCoverModeContain')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.videoCoverModeHelp')}
                </p>
              </div>

              {/* Botão de salvar vídeo */}
              <Button 
                onClick={handleSaveVideoSettings} 
                disabled={videoSaving}
                className="w-full"
              >
                {videoSaving ? (t('settings.saving') || 'Salvando...') : (t('settings.saveVideoSettings') || 'Salvar Configurações de Vídeo')}
              </Button>

              {/* Informação sobre CORS */}
              <div className="p-3 bg-amber-50 rounded-lg">
                <p className="text-amber-800 text-sm">
                  {t('settings.videoSecurityNote')}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      

      {/* Card de Informações da Loja - Modo Visualização */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            {t('settings.storeDetails') || 'Dados da Loja'}
          </CardTitle>
          <CardDescription>
            {t('settings.storeDetailsDescription') || 'Para editar estas informações, acesse o Admin Web'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome da Loja */}
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t('settings.storeName')}</Label>
                <p className="font-medium">{settings?.name ?? '-'}</p>
              </div>

              {/* CNPJ */}
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t('settings.taxId') || 'CNPJ'}</Label>
                <p className="font-medium">{settings?.taxId ?? '-'}</p>
              </div>

              {/* E-mail */}
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t('settings.storeEmail') || 'E-mail'}</Label>
                <p className="font-medium">{settings?.email ?? '-'}</p>
              </div>

              {/* Telefone */}
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t('settings.storePhone')}</Label>
                <p className="font-medium">{settings?.phone ?? '-'}</p>
              </div>

              {/* Endereço */}
              <div className="space-y-1 md:col-span-2">
                <Label className="text-muted-foreground text-xs">{t('settings.storeAddress')}</Label>
                <p className="font-medium">{settings?.address ?? '-'}</p>
              </div>

              {/* Taxa de Imposto */}
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t('settings.taxPercentage')}</Label>
                <p className="font-medium">{settings?.taxPercentage ? `${settings.taxPercentage}%` : '-'}</p>
              </div>

              {/* Moeda */}
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t('settings.currency')}</Label>
                <p className="font-medium">{currentCurrency?.symbol} {currentCurrency?.code}</p>
              </div>

              {/* Descrição */}
              {settings?.description && (
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-muted-foreground text-xs">{t('settings.storeDescription') || 'Descrição'}</Label>
                  <p className="font-medium text-sm">{settings.description}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Nota informativa */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <Store className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">{t('settings.storeInfoManagedByAdmin') || 'Informações da Loja'}</p>
              <p className="mt-1 text-xs">
                {t('settings.storeInfoManagedByAdminDescription') || 'Nome, CNPJ, endereço e outras informações da loja são gerenciadas pelo Admin Web. Acesse o painel administrativo para editar esses dados.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
