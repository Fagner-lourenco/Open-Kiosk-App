/**
 * StoreDetailsTab - inline details / edit form extracted from StoreDetailPage.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DangerZoneCard } from '@/components/common/DangerZoneCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Save,
  Loader2,
  Trash2,
  Users,
  MapPin,
  Phone,
  Mail,
  Clock,
} from 'lucide-react';

interface StoreInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  operators?: Array<{ id: string; email: string; role: string }>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface FormData {
  name: string;
  address: string;
  phone: string;
  email: string;
  isActive: boolean;
}

interface StoreDetailsTabProps {
  store: StoreInfo;
  isEditMode: boolean;
  isSuperAdmin: boolean;
  formData: FormData;
  setFormData: (data: FormData) => void;
  isSaving: boolean;
  onSave: () => void;
  onDeleteRequest: () => void;
}

export function StoreDetailsTab({
  store,
  isEditMode,
  isSuperAdmin,
  formData,
  setFormData,
  isSaving,
  onSave,
  onDeleteRequest,
}: StoreDetailsTabProps) {
  return (
    <div className="space-y-6">
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

            <div className="flex items-center justify-between p-4 border rounded-lg">
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
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Endereço</p>
                  <p className="text-sm text-muted-foreground">
                    {store.address || 'Não informado'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Telefone</p>
                  <p className="text-sm text-muted-foreground">
                    {store.phone || 'Não informado'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
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
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Criada em</p>
                  <p className="text-sm text-muted-foreground">
                    {store.createdAt?.toLocaleDateString('pt-BR') || 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Última atualização</p>
                  <p className="text-sm text-muted-foreground">
                    {store.updatedAt?.toLocaleDateString('pt-BR') || 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
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

      {/* Save button for edit mode */}
      {isEditMode && (
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSaving ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      )}

      {/* Danger Zone - Only for superadmin */}
      {isSuperAdmin && (
        <DangerZoneCard description="Ações irreversíveis para esta loja">
            <Button variant="destructive" onClick={onDeleteRequest}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir loja
            </Button>
        </DangerZoneCard>
      )}
    </div>
  );
}
