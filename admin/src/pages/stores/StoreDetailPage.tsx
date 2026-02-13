/**
 * ============================================================================
 * StoreDetailPage - Detalhes da Loja (Refatorado)
 * ============================================================================
 * 
 * Página completa de detalhes de uma loja com todas as abas funcionais.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { logStoreAction } from '@/services/auditService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { 
  ArrowLeft,
  Store,
  Save,
  Loader2,
  AlertCircle,
  Trash2,
  Users,
  Settings,
  BarChart3,
  MapPin,
  Phone,
  Mail,
  Clock,
  Package,
  ShoppingCart,
  Boxes,
  Beer,
  Activity,
  Droplets,
  Wrench,
} from 'lucide-react';

// Import store tab components
import {
  StoreProductsTab,
  StoreInventoryTab,
  StoreOrdersTab,
  StoreReportsTab,
  StoreSettingsTab,
  StoreMembersTab,
  StoreKegsTab,
  StoreOperationsTab,
  StoreWastageTab,
  StoreMaintenanceTab,
} from '@/components/store';

interface StoreData {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  settings?: Record<string, unknown>;
  operators?: Array<{
    id: string;
    email: string;
    role: string;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

export function StoreDetailPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentFranchise, refreshStores } = useFranchise();
  const { user, isSuperAdmin } = useAuth();
  
  const isEditMode = searchParams.get('edit') === 'true';
  const initialTab = searchParams.get('tab') || 'details';
  
  const [store, setStore] = useState<StoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    isActive: true,
  });

  useEffect(() => {
    if (currentFranchise && storeId) {
      loadStore();
    }
  }, [currentFranchise, storeId]);

  const loadStore = async () => {
    try {
      const storeDoc = await getDoc(
        doc(db, `franchises/${currentFranchise!.id}/stores/${storeId}`)
      );
      
      if (!storeDoc.exists()) {
        setError('Loja não encontrada');
        setIsLoading(false);
        return;
      }

      const data = storeDoc.data();
      const storeData: StoreData = {
        id: storeDoc.id,
        name: data.name,
        address: data.address,
        phone: data.phone,
        email: data.email,
        isActive: data.isActive !== false,
        settings: data.settings,
        operators: data.operators || data.members || [],
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      };
      
      setStore(storeData);
      setFormData({
        name: storeData.name,
        address: storeData.address || '',
        phone: storeData.phone || '',
        email: storeData.email || '',
        isActive: storeData.isActive,
      });
    } catch (err) {
      console.error('Error loading store:', err);
      setError('Erro ao carregar loja');
    }
    
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!currentFranchise || !storeId) return;
    
    setIsSaving(true);
    setError(null);

    try {
      await updateDoc(
        doc(db, `franchises/${currentFranchise.id}/stores/${storeId}`),
        {
          name: formData.name,
          address: formData.address || null,
          phone: formData.phone || null,
          email: formData.email || null,
          isActive: formData.isActive,
          updatedAt: new Date(),
        }
      );

      if (user) {
        const changedFields: string[] = [];
        if (formData.name !== store?.name) changedFields.push('name');
        if (formData.address !== (store?.address || '')) changedFields.push('address');
        if (formData.phone !== (store?.phone || '')) changedFields.push('phone');
        if (formData.email !== (store?.email || '')) changedFields.push('email');
        if (formData.isActive !== store?.isActive) changedFields.push('isActive');

        try {
          await logStoreAction(
            currentFranchise.id,
            'update',
            {
              id: user.uid,
              email: user.email || '',
              name: user.displayName || undefined,
            },
            {
              id: storeId,
              name: store?.name || formData.name || storeId,
            },
            {
              changedFields,
            }
          );
        } catch (auditError) {
          console.warn('[audit] Falha ao registrar atualizacao de loja:', auditError);
        }
      }

      await refreshStores();
      navigate(`/stores/${storeId}`);
    } catch (err) {
      console.error('Error saving store:', err);
      setError('Erro ao salvar loja');
    }
    
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!currentFranchise || !storeId) return;
    
    setIsDeleting(true);
    const deletedStoreName = store?.name || storeId;

    try {
      await deleteDoc(
        doc(db, `franchises/${currentFranchise.id}/stores/${storeId}`)
      );

      if (user) {
        try {
          await logStoreAction(
            currentFranchise.id,
            'delete',
            {
              id: user.uid,
              email: user.email || '',
              name: user.displayName || undefined,
            },
            {
              id: storeId,
              name: deletedStoreName,
            }
          );
        } catch (auditError) {
          console.warn('[audit] Falha ao registrar exclusao de loja:', auditError);
        }
      }

      await refreshStores();
      navigate('/stores');
    } catch (err) {
      console.error('Error deleting store:', err);
      setError('Erro ao excluir loja');
      setIsDeleting(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
    navigate(`/stores/${storeId}?${params.toString()}`, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error && !store) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link to="/stores">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para lojas
          </Button>
        </Link>
      </div>
    );
  }

  if (!store || !currentFranchise || !storeId) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/stores">
            <Button variant="ghost" size="icon" aria-label="Voltar para lojas">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
              <Badge variant={store.isActive ? 'default' : 'secondary'}>
                {store.isActive ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
            <p className="text-gray-500">{store.address || 'Sem endereço'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <>
              <Button variant="outline" onClick={() => navigate(`/stores/${storeId}`)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar
                  </>
                )}
              </Button>
            </>
          ) : (
            <Link to={`/stores/${storeId}?edit=true`}>
              <Button>Editar</Button>
            </Link>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Operacao
            </p>
            <TabsList className="h-auto flex-wrap gap-1">
              <TabsTrigger value="orders">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Pedidos
              </TabsTrigger>
              <TabsTrigger value="operations">
                <Activity className="mr-2 h-4 w-4" />
                Operacao
              </TabsTrigger>
              <TabsTrigger value="kegs">
                <Beer className="mr-2 h-4 w-4" />
                Barris
              </TabsTrigger>
              <TabsTrigger value="wastage">
                <Droplets className="mr-2 h-4 w-4" />
                Perdas
              </TabsTrigger>
              <TabsTrigger value="maintenance">
                <Wrench className="mr-2 h-4 w-4" />
                Manutencao
              </TabsTrigger>
            </TabsList>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Catalogo
            </p>
            <TabsList className="h-auto flex-wrap gap-1">
              <TabsTrigger value="products">
                <Package className="mr-2 h-4 w-4" />
                Produtos
              </TabsTrigger>
              <TabsTrigger value="inventory">
                <Boxes className="mr-2 h-4 w-4" />
                Inventario
              </TabsTrigger>
              <TabsTrigger value="reports">
                <BarChart3 className="mr-2 h-4 w-4" />
                Relatorios
              </TabsTrigger>
            </TabsList>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Gestao
            </p>
            <TabsList className="h-auto flex-wrap gap-1">
              <TabsTrigger value="details">
                <Store className="mr-2 h-4 w-4" />
                Detalhes
              </TabsTrigger>
              <TabsTrigger value="members">
                <Users className="mr-2 h-4 w-4" />
                Membros
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings className="mr-2 h-4 w-4" />
                Configuracoes
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="details" className="space-y-6 mt-6">
          {isEditMode ? (
            <Card>
              <CardHeader>
                <CardTitle>Informações da Loja</CardTitle>
                <CardDescription>
                  Edite os dados básicos da loja
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da loja *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome da loja"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Endereço completo"
                    rows={2}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="loja@email.com"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="isActive">Loja ativa</Label>
                    <p className="text-sm text-gray-500">
                      Lojas inativas não aparecem no app
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Informações de Contato</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Endereço</p>
                      <p className="text-sm text-gray-500">
                        {store.address || 'Não informado'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Telefone</p>
                      <p className="text-sm text-gray-500">
                        {store.phone || 'Não informado'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-sm text-gray-500">
                        {store.email || 'Não informado'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Informações Gerais</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Criada em</p>
                      <p className="text-sm text-gray-500">
                        {store.createdAt?.toLocaleDateString('pt-BR') || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Última atualização</p>
                      <p className="text-sm text-gray-500">
                        {store.updatedAt?.toLocaleDateString('pt-BR') || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Membros</p>
                      <p className="text-sm text-gray-500">
                        {store.operators?.length || 0} usuário(s)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Danger Zone - Only for superadmin */}
          {isSuperAdmin && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-base text-red-600">Zona de Perigo</CardTitle>
                <CardDescription>
                  Ações irreversíveis para esta loja
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir loja
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="mt-6">
          <StoreProductsTab 
            franchiseId={currentFranchise.id} 
            storeId={storeId} 
          />
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="mt-6">
          <StoreInventoryTab 
            franchiseId={currentFranchise.id} 
            storeId={storeId} 
          />
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="mt-6">
          <StoreOrdersTab
            franchiseId={currentFranchise.id}
            storeId={storeId}
          />
        </TabsContent>

        {/* Operations Tab */}
        <TabsContent value="operations" className="mt-6">
          <StoreOperationsTab
            franchiseId={currentFranchise.id}
            storeId={storeId}
          />
        </TabsContent>

        {/* Kegs Tab */}
        <TabsContent value="kegs" className="mt-6">
          <StoreKegsTab
            franchiseId={currentFranchise.id}
            storeId={storeId}
          />
        </TabsContent>

        {/* Wastage Tab */}
        <TabsContent value="wastage" className="mt-6">
          <StoreWastageTab
            franchiseId={currentFranchise.id}
            storeId={storeId}
          />
        </TabsContent>

        {/* Maintenance Tab */}
        <TabsContent value="maintenance" className="mt-6">
          <StoreMaintenanceTab
            franchiseId={currentFranchise.id}
            storeId={storeId}
          />
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="mt-6">
          <StoreReportsTab 
            franchiseId={currentFranchise.id} 
            storeId={storeId} 
          />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-6">
          <StoreSettingsTab 
            franchiseId={currentFranchise.id} 
            storeId={storeId} 
          />
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="mt-6">
          <StoreMembersTab 
            franchiseId={currentFranchise.id} 
            storeId={storeId} 
          />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Excluir loja"
        description={
          <>
            Tem certeza que deseja excluir a loja "{store.name}"? Esta acao nao pode ser desfeita
            e todos os dados relacionados (pedidos, estoque, configuracoes e membros) serao
            perdidos.
          </>
        }
        onConfirm={handleDelete}
        isConfirming={isDeleting}
        confirmLabel="Excluir loja"
        confirmingLabel="Excluindo..."
      />
    </div>
  );
}
