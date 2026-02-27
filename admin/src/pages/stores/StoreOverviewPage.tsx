/**
 * ============================================================================
 * StoreOverviewPage — Visão Geral da Loja
 * ============================================================================
 *
 * Exibe informações de contato, dados gerais, formulário de edição
 * e zona de perigo (excluir loja). Substitui a antiga aba "details".
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useFranchise } from '@/context/FranchiseContext';
import { logStoreAction } from '@/services/auditService';
import { deleteStore } from '@/services/storeService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { DangerZoneCard } from '@/components/common/DangerZoneCard';
import { useStoreContext } from '@/components/store/StoreLayout';
import {
  Save,
  Loader2,
  AlertCircle,
  Trash2,
  MapPin,
  Phone,
  Mail,
  Clock,
  Users,
} from 'lucide-react';

export function StoreOverviewPage() {
  const { store, franchiseId, storeId, refreshStore } = useStoreContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const { refreshStores } = useFranchise();

  const isEditMode = searchParams.get('edit') === 'true';

  const [formData, setFormData] = useState({
    name: store.name,
    address: store.address || '',
    phone: store.phone || '',
    email: store.email || '',
    isActive: store.isActive,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync formData when store data changes (e.g. after refresh)
  useEffect(() => {
    setFormData({
      name: store.name,
      address: store.address || '',
      phone: store.phone || '',
      email: store.email || '',
      isActive: store.isActive,
    });
  }, [store.name, store.address, store.phone, store.email, store.isActive]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await updateDoc(
        doc(db, `franchises/${franchiseId}/stores/${storeId}`),
        {
          name: formData.name,
          address: formData.address || null,
          phone: formData.phone || null,
          email: formData.email || null,
          isActive: formData.isActive,
          updatedAt: serverTimestamp(),
        },
      );

      if (user) {
        const changedFields: string[] = [];
        if (formData.name !== store.name) changedFields.push('name');
        if (formData.address !== (store.address || '')) changedFields.push('address');
        if (formData.phone !== (store.phone || '')) changedFields.push('phone');
        if (formData.email !== (store.email || '')) changedFields.push('email');
        if (formData.isActive !== store.isActive) changedFields.push('isActive');

        try {
          await logStoreAction(franchiseId, 'update', {
            id: user.uid,
            email: user.email || '',
            name: user.displayName || undefined,
          }, {
            id: storeId,
            name: store.name || formData.name || storeId,
          }, { changedFields });
        } catch (auditError) {
          console.warn('[audit] Falha ao registrar atualização de loja:', auditError);
        }
      }

      await refreshStores();
      refreshStore();
      navigate(`/stores/${storeId}`);
    } catch (err) {
      console.error('Error saving store:', err);
      setError('Erro ao salvar loja');
    }

    setIsSaving(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const deletedStoreName = store.name || storeId;

    try {
      // [FIX BUG-S1] Cascade delete via storeService
      await deleteStore(franchiseId, storeId);

      if (user) {
        try {
          await logStoreAction(franchiseId, 'delete', {
            id: user.uid,
            email: user.email || '',
            name: user.displayName || undefined,
          }, {
            id: storeId,
            name: deletedStoreName,
          });
        } catch (auditError) {
          console.warn('[audit] Falha ao registrar exclusão de loja:', auditError);
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

  return (
    <div className="space-y-6">
      {/* Edit / View toggle */}
      <div className="flex justify-end">
        {isEditMode ? (
          <div className="flex gap-2">
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
          </div>
        ) : (
          <Link to={`/stores/${storeId}?edit=true`}>
            <Button>Editar</Button>
          </Link>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isEditMode ? (
        <Card>
          <CardHeader>
            <CardTitle>Informações da Loja</CardTitle>
            <CardDescription>Edite os dados básicos da loja</CardDescription>
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

            <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label htmlFor="isActive">Loja ativa</Label>
                <p className="text-sm text-muted-foreground">
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Endereço</p>
                  <p className="text-sm text-muted-foreground">
                    {store.address || 'Não informado'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Telefone</p>
                  <p className="text-sm text-muted-foreground">
                    {store.phone || 'Não informado'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Criada em</p>
                  <p className="text-sm text-muted-foreground">
                    {store.createdAt?.toLocaleDateString('pt-BR') || 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Última atualização</p>
                  <p className="text-sm text-muted-foreground">
                    {store.updatedAt?.toLocaleDateString('pt-BR') || 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Membros</p>
                  <p className="text-sm text-muted-foreground">
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
        <DangerZoneCard description="Ações irreversíveis para esta loja">
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir loja
          </Button>
        </DangerZoneCard>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Excluir loja"
        description={
          <>
            Tem certeza que deseja excluir a loja &quot;{store.name}&quot;? Esta ação não pode ser
            desfeita e todos os dados relacionados (pedidos, estoque, configurações e membros)
            serão perdidos.
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
