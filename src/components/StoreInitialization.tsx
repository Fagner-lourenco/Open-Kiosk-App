import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Store, Database } from "lucide-react";
import { StoreSettings } from "@/types/store";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";

interface StoreInitializationProps {
  onComplete: (settings: StoreSettings) => void;
}

const StoreInitialization = ({ onComplete }: StoreInitializationProps) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<StoreSettings>({
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
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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
      if (!settings.name || !settings.taxId || !settings.firebaseConfig.projectId) {
        toast({
          title: t('common.error'),
          description: t('setup.fillRequired'),
          variant: "destructive"
        });
        return;
      }

      // Save to localStorage for persistence
      localStorage.setItem('storeSettings', JSON.stringify(settings));
      localStorage.setItem('storeInitialized', 'true');

      toast({
        title: t('common.success'),
        description: t('setup.setupComplete')
      });

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
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="apiKey">{t('setup.apiKey')}</Label>
                  <Input
                    id="apiKey"
                    value={settings.firebaseConfig.apiKey}
                    onChange={(e) => handleFirebaseConfigChange('apiKey', e.target.value)}
                    placeholder={t('setup.apiKeyPlaceholder')}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="projectId">{t('setup.projectId')}</Label>
                  <Input
                    id="projectId"
                    value={settings.firebaseConfig.projectId}
                    onChange={(e) => handleFirebaseConfigChange('projectId', e.target.value)}
                    placeholder={t('setup.projectIdPlaceholder')}
                    required
                  />
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
                  <Input
                    id="appId"
                    value={settings.firebaseConfig.appId}
                    onChange={(e) => handleFirebaseConfigChange('appId', e.target.value)}
                    placeholder={t('setup.appIdPlaceholder')}
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? t('setup.settingUp') : t('setup.completeSetup')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreInitialization;
