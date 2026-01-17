
import SettingsPanel from "@/components/SettingsPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings, Globe, Usb, Wifi, Bluetooth, Zap, Trash2, Beer, Volume2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useLanguage, useTranslation } from "@/i18n";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Language } from "@/i18n";
import type { ESP32ConnectionType } from "@/types/store";
import esp32Service from "@/services/esp32CommunicationService";

export default function AdminSettings() {
  const { currentCurrency, currencies, updateCurrency, loading } = useSettings();
  const { settings, updateSettings } = useStoreSettings();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  // ESP32 settings com defaults
  const esp32AutoConnect = settings?.esp32AutoConnect ?? true;
  const esp32ConnectionOrder = settings?.esp32ConnectionOrder ?? ['usb', 'wifi', 'bluetooth'];
  const esp32HeartbeatIntervalMs = settings?.esp32HeartbeatIntervalMs ?? 15000;
  
  // Drink Pickup settings com defaults
  const drinkPickupTimeoutSeconds = settings?.drinkPickupTimeoutSeconds ?? 90;
  const drinkPickupSoundEnabled = settings?.drinkPickupSoundEnabled ?? true;

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
      
      {/* Configurações gerais da loja */}
      <SettingsPanel />
    </div>
  );
}
