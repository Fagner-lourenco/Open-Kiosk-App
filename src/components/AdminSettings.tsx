
import SettingsPanel from "@/components/SettingsPanel";
import ESP32ConnectionPanel from "@/components/ESP32ConnectionPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Globe } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useLanguage, useTranslation } from "@/i18n";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Language } from "@/i18n";

export default function AdminSettings() {
  const { currentCurrency, currencies, updateCurrency, loading } = useSettings();
  const { settings, updateSettings } = useStoreSettings();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

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
      
      {/* ESP32 Connection Panel */}
      <ESP32ConnectionPanel />
      
      <SettingsPanel />
    </div>
  );
}
