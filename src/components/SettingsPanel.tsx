import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { StoreSettings } from "@/types/store";
import { Settings, Save, RotateCcw, AlertTriangle, Eye, EyeOff, Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";

const mask = (value: string) => value ? "●".repeat(Math.max(value.length, 5)) : "";

// Firebase field config - labels and placeholders are translation keys
const getFirebaseFields = (t: (key: string) => string) => [
  { key: "apiKey", label: t('settings.apiKey') + " *", placeholder: t('settings.apiKeyPlaceholder') },
  { key: "projectId", label: t('settings.projectId') + " *", placeholder: t('settings.projectIdPlaceholder') },
  { key: "authDomain", label: t('settings.authDomainLabel'), placeholder: t('settings.authDomainPlaceholder') },
  { key: "storageBucket", label: t('settings.storageBucketLabel'), placeholder: t('settings.storageBucketPlaceholder') },
  { key: "messagingSenderId", label: t('settings.messagingSenderIdLabel'), placeholder: t('settings.messagingSenderIdPlaceholder') },
  { key: "appId", label: t('settings.appIdLabel'), placeholder: t('settings.appIdPlaceholder') },
];

const SettingsPanel = () => {
  const { t } = useTranslation();
  const { settings, updateSettings, resetStore } = useStoreSettings();
  const [localSettings, setLocalSettings] = useState<StoreSettings>(
    settings || {
      name: "",
      currency: "INR",
      taxId: "",
      taxPercentage: 18,
      firebaseConfig: {
        apiKey: "",
        authDomain: "",
        projectId: "",
        storageBucket: "",
        messagingSenderId: "",
        appId: ""
      },
      useThermalPrinter: false
    }
  );
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Visibility state for each firebase config field
  const [firebaseVisibility, setFirebaseVisibility] = useState<Record<string, boolean>>({
    apiKey: false,
    projectId: false,
    authDomain: false,
    storageBucket: false,
    messagingSenderId: false,
    appId: false,
  });

  // Keep `localSettings` in sync with `settings` from the hook
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  // Reset all firebase fields to hidden if settings change (optional but clean)
  useEffect(() => {
    setFirebaseVisibility({
      apiKey: false,
      projectId: false,
      authDomain: false,
      storageBucket: false,
      messagingSenderId: false,
      appId: false,
    });
  }, [settings]);

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setLocalSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFirebaseConfigChange = (field: string, value: string) => {
    setLocalSettings(prev => ({
      ...prev,
      firebaseConfig: {
        ...prev.firebaseConfig,
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      if (!localSettings.name || !localSettings.taxId || !localSettings.firebaseConfig.projectId) {
        toast({
          title: t('common.error'),
          description: t('settings.fillRequired'),
          variant: "destructive"
        });
        return;
      }

      updateSettings(localSettings);
      toast({
        title: t('common.success'),
        description: t('settings.settingsSaved')
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: t('common.error'),
        description: t('settings.updateFailed'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (confirm(t('settings.resetStoreConfirm'))) {
      resetStore();
      toast({
        title: t('settings.storeResetTitle'),
        description: t('settings.storeResetDescription'),
      });
    }
  };

  const toggleFirebaseVisibility = (key: string) => {
    setFirebaseVisibility(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const { currentCurrency, currencies, updateCurrency, loading } = useSettings();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            {t('settings.storeInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="storeName">{t('settings.storeName')} *</Label>
            <Input
              id="storeName"
              value={localSettings.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder={t('settings.storeNamePlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="taxId">{t('settings.taxIdGst')}</Label>
              <Input
                id="taxId"
                value={localSettings.taxId}
                onChange={(e) => handleInputChange('taxId', e.target.value)}
                placeholder={t('settings.taxIdPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="taxPercentage">{t('settings.taxPercentage')} (%)</Label>
              <Input
                id="taxPercentage"
                type="number"
                value={localSettings.taxPercentage}
                onChange={(e) => handleInputChange('taxPercentage', parseFloat(e.target.value))}
                placeholder={t('settings.taxPercentagePlaceholder')}
              />
            </div>
          </div>
          <div>
            <Label className="text-m text-bold">{t('settings.selectCurrencyLabel')}</Label>
            <Select
              value={currentCurrency.code}
              onValueChange={updateCurrency}
              disabled={loading}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.symbol} {currency.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Printer className="w-5 h-5 mr-2" />
            {t('settings.printer')}
          </CardTitle>
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
              checked={localSettings.useThermalPrinter || false}
              onCheckedChange={(checked) => handleInputChange('useThermalPrinter', checked)}
            />
          </div>

          {localSettings.useThermalPrinter && (
            <div>
              <Label htmlFor="comPort">{t('settings.comPortThermal')}</Label>
              <Input
                id="comPort"
                value={localSettings.comPort || ""}
                onChange={(e) => handleInputChange('comPort', e.target.value)}
                placeholder={t('settings.comPortPlaceholder')}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.comPortHelp')}
              </p>
            </div>
          )}

          {!localSettings.useThermalPrinter && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-blue-800 text-sm">
                {t('settings.pdfModeDescription')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.firebase')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {getFirebaseFields(t).map(field => (
            <div key={field.key} className={["storageBucket", "messagingSenderId"].includes(field.key) ? "grid grid-cols-2 gap-4" : ""}>
              {["storageBucket", "messagingSenderId"].includes(field.key) ? (
                <>
                  {field.key === "storageBucket" && (
                    <div className="relative">
                      <Label htmlFor={field.key}>{field.label}</Label>
                      <Input
                        id={field.key}
                        type={firebaseVisibility[field.key] ? "text" : "password"}
                        value={
                          firebaseVisibility[field.key]
                            ? localSettings.firebaseConfig[field.key as keyof typeof localSettings.firebaseConfig] || ""
                            : mask(localSettings.firebaseConfig[field.key as keyof typeof localSettings.firebaseConfig] || "")
                        }
                        onChange={(e) => handleFirebaseConfigChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-[34px]"
                        onClick={() => toggleFirebaseVisibility(field.key)}
                        tabIndex={-1}
                      >
                        {firebaseVisibility[field.key] ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                  )}
                  {field.key === "messagingSenderId" && (
                    <div className="relative">
                      <Label htmlFor={field.key}>{field.label}</Label>
                      <Input
                        id={field.key}
                        type={firebaseVisibility[field.key] ? "text" : "password"}
                        value={
                          firebaseVisibility[field.key]
                            ? localSettings.firebaseConfig[field.key as keyof typeof localSettings.firebaseConfig] || ""
                            : mask(localSettings.firebaseConfig[field.key as keyof typeof localSettings.firebaseConfig] || "")
                        }
                        onChange={(e) => handleFirebaseConfigChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-[34px]"
                        onClick={() => toggleFirebaseVisibility(field.key)}
                        tabIndex={-1}
                      >
                        {firebaseVisibility[field.key] ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="relative mb-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type={firebaseVisibility[field.key] ? "text" : "password"}
                    value={
                      firebaseVisibility[field.key]
                        ? localSettings.firebaseConfig[field.key as keyof typeof localSettings.firebaseConfig] || ""
                        : mask(localSettings.firebaseConfig[field.key as keyof typeof localSettings.firebaseConfig] || "")
                    }
                    onChange={(e) => handleFirebaseConfigChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-[34px]"
                    onClick={() => toggleFirebaseVisibility(field.key)}
                    tabIndex={-1}
                  >
                    {firebaseVisibility[field.key] ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button onClick={handleSave} disabled={isLoading} className="flex-1">
          <Save className="w-4 h-4 mr-2" />
          {isLoading ? t('settings.saving') : t('settings.saveSettings')}
        </Button>
        
        <Button variant="destructive" onClick={handleReset} className="flex items-center">
          <RotateCcw className="w-4 h-4 mr-2" />
          {t('settings.resetStore')}
        </Button>
      </div>
      
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
            <div className="text-sm text-orange-800">
              <p className="font-medium">{t('settings.importantNotes')}</p>
              <ul className="mt-1 list-disc list-inside space-y-1 text-xs">
                <li>{t('settings.noteRefresh')}</li>
                <li>{t('settings.noteReset')}</li>
                <li>{t('settings.noteValidateFirebase')}</li>
                <li>{t('settings.noteComPort')}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPanel;