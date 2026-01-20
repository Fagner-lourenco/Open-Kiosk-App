/**
 * ============================================================================
 * SettingsPage - Configurações da Franquia
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Settings,
  Building2,
  Bell,
  Shield,
  Palette,
  Globe,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Trash2
} from 'lucide-react';

interface FranchiseSettings {
  name: string;
  description: string;
  website: string;
  supportEmail: string;
  notifications: {
    emailOnNewOrder: boolean;
    emailOnLowStock: boolean;
    emailOnNewMember: boolean;
  };
  appearance: {
    primaryColor: string;
    logoUrl: string;
  };
}

export function SettingsPage() {
  const { currentFranchise, refreshFranchises } = useFranchise();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  
  const [settings, setSettings] = useState<FranchiseSettings>({
    name: '',
    description: '',
    website: '',
    supportEmail: '',
    notifications: {
      emailOnNewOrder: true,
      emailOnLowStock: true,
      emailOnNewMember: true,
    },
    appearance: {
      primaryColor: '#3b82f6',
      logoUrl: '',
    },
  });

  useEffect(() => {
    if (currentFranchise) {
      setSettings({
        name: currentFranchise.name || '',
        description: currentFranchise.description || '',
        website: currentFranchise.website || '',
        supportEmail: currentFranchise.supportEmail || '',
        notifications: {
          emailOnNewOrder: currentFranchise.settings?.notifications?.emailOnNewOrder ?? true,
          emailOnLowStock: currentFranchise.settings?.notifications?.emailOnLowStock ?? true,
          emailOnNewMember: currentFranchise.settings?.notifications?.emailOnNewMember ?? true,
        },
        appearance: {
          primaryColor: currentFranchise.settings?.appearance?.primaryColor || '#3b82f6',
          logoUrl: currentFranchise.settings?.appearance?.logoUrl || '',
        },
      });
    }
  }, [currentFranchise]);

  const handleSave = async () => {
    if (!currentFranchise) return;
    
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      await updateDoc(doc(db, 'franchises', currentFranchise.id), {
        name: settings.name,
        description: settings.description || null,
        website: settings.website || null,
        supportEmail: settings.supportEmail || null,
        'settings.notifications': settings.notifications,
        'settings.appearance': settings.appearance,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      });

      await refreshFranchises();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Erro ao salvar configurações');
    }
    
    setIsSaving(false);
  };

  const handleDeleteFranchise = async () => {
    if (!currentFranchise || deleteConfirmation !== currentFranchise.name) return;
    
    setIsDeleting(true);
    setError(null);

    try {
      // Delete all subcollections first
      const subcollections = ['stores', 'members', 'invitations', 'auditLogs'];
      
      for (const subcol of subcollections) {
        const snapshot = await getDocs(collection(db, `franchises/${currentFranchise.id}/${subcol}`));
        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(db, `franchises/${currentFranchise.id}/${subcol}`, docSnap.id));
        }
      }

      // Delete the franchise document
      await deleteDoc(doc(db, 'franchises', currentFranchise.id));

      // Refresh and navigate away
      await refreshFranchises();
      navigate('/dashboard');
    } catch (err) {
      console.error('Error deleting franchise:', err);
      setError('Erro ao excluir franquia. Tente novamente.');
      setIsDeleting(false);
    }
  };

  if (!currentFranchise) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <CardTitle>Nenhuma franquia selecionada</CardTitle>
            <CardDescription>
              Selecione uma franquia no menu lateral para acessar as configurações
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-gray-500">
            Gerencie as configurações de {currentFranchise.name}
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Alterações
            </>
          )}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {saveSuccess && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">
            Configurações salvas com sucesso!
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <Settings className="mr-2 h-4 w-4" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="mr-2 h-4 w-4" />
            Aparência
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4" />
            Segurança
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações da Franquia</CardTitle>
              <CardDescription>
                Dados básicos da sua franquia
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Franquia</Label>
                <Input
                  id="name"
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  placeholder="Nome da franquia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={settings.description}
                  onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                  placeholder="Descrição da franquia"
                  rows={3}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="website"
                      value={settings.website}
                      onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                      placeholder="https://example.com"
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Email de Suporte</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={settings.supportEmail}
                    onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                    placeholder="suporte@franquia.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notificações por Email</CardTitle>
              <CardDescription>
                Configure quais notificações deseja receber
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label>Novos pedidos</Label>
                  <p className="text-sm text-gray-500">
                    Receber email quando novos pedidos forem realizados
                  </p>
                </div>
                <Switch
                  checked={settings.notifications.emailOnNewOrder}
                  onCheckedChange={(checked) => 
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, emailOnNewOrder: checked }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label>Estoque baixo</Label>
                  <p className="text-sm text-gray-500">
                    Receber alerta quando o estoque estiver baixo
                  </p>
                </div>
                <Switch
                  checked={settings.notifications.emailOnLowStock}
                  onCheckedChange={(checked) => 
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, emailOnLowStock: checked }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label>Novos membros</Label>
                  <p className="text-sm text-gray-500">
                    Receber notificação quando novos membros entrarem
                  </p>
                </div>
                <Switch
                  checked={settings.notifications.emailOnNewMember}
                  onCheckedChange={(checked) => 
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, emailOnNewMember: checked }
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personalização</CardTitle>
              <CardDescription>
                Personalize a aparência da sua franquia
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Cor Primária</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="primaryColor"
                    value={settings.appearance.primaryColor}
                    onChange={(e) => 
                      setSettings({
                        ...settings,
                        appearance: { ...settings.appearance, primaryColor: e.target.value }
                      })
                    }
                    className="w-12 h-12 rounded-lg cursor-pointer border"
                  />
                  <Input
                    value={settings.appearance.primaryColor}
                    onChange={(e) => 
                      setSettings({
                        ...settings,
                        appearance: { ...settings.appearance, primaryColor: e.target.value }
                      })
                    }
                    placeholder="#3b82f6"
                    className="w-32"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logoUrl">URL do Logo</Label>
                <Input
                  id="logoUrl"
                  value={settings.appearance.logoUrl}
                  onChange={(e) => 
                    setSettings({
                      ...settings,
                      appearance: { ...settings.appearance, logoUrl: e.target.value }
                    })
                  }
                  placeholder="https://example.com/logo.png"
                />
                {settings.appearance.logoUrl && (
                  <img 
                    src={settings.appearance.logoUrl} 
                    alt="Logo preview" 
                    className="w-20 h-20 object-contain border rounded-lg mt-2"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Autenticação de Dois Fatores</CardTitle>
              <CardDescription>
                Adicione uma camada extra de segurança à sua conta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  A autenticação de dois fatores estará disponível em breve. 
                  Por enquanto, mantenha sua senha segura e não a compartilhe.
                </AlertDescription>
              </Alert>
              
              <div className="flex items-center justify-between p-4 border rounded-lg opacity-60">
                <div>
                  <h4 className="font-medium">App Autenticador</h4>
                  <p className="text-sm text-gray-500">
                    Use Google Authenticator, Authy ou similar
                  </p>
                </div>
                <Badge variant="secondary">Em breve</Badge>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg opacity-60">
                <div>
                  <h4 className="font-medium">SMS</h4>
                  <p className="text-sm text-gray-500">
                    Receber código por mensagem de texto
                  </p>
                </div>
                <Badge variant="secondary">Em breve</Badge>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg opacity-60">
                <div>
                  <h4 className="font-medium">Email</h4>
                  <p className="text-sm text-gray-500">
                    Receber código por email
                  </p>
                </div>
                <Badge variant="secondary">Em breve</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessão Atual</CardTitle>
              <CardDescription>
                Informações da sua sessão de login
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sessão atual real */}
              <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 border-green-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Shield className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-medium flex items-center gap-2">
                      {user?.email}
                      <Badge variant="secondary" className="text-xs">Atual</Badge>
                    </h4>
                    <p className="text-sm text-gray-500">
                      Sessão ativa
                    </p>
                  </div>
                </div>
              </div>
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  O gerenciamento de múltiplas sessões estará disponível em breve.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
          {/* Danger Zone */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-base text-red-600">Zona de Perigo</CardTitle>
              <CardDescription>
                Ações irreversíveis para esta franquia
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir Franquia
              </Button>
              <p className="text-sm text-gray-500 mt-2">
                Esta ação excluirá permanentemente a franquia e todos os seus dados.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) setDeleteConfirmation('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Excluir Franquia</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir "{currentFranchise.name}"?
              Esta ação não pode ser desfeita e todos os dados (lojas, pedidos, membros) serão perdidos permanentemente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-600">
                Para confirmar, digite o nome da franquia: <strong>{currentFranchise.name}</strong>
              </AlertDescription>
            </Alert>
            
            <Input
              placeholder="Digite o nome da franquia"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="border-red-200 focus:border-red-400"
            />
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmation('');
              }}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteFranchise}
              disabled={isDeleting || deleteConfirmation !== currentFranchise.name}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir Franquia
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
