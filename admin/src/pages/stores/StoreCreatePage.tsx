/**
 * ============================================================================
 * StoreCreatePage - Criar Nova Loja
 * ============================================================================
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { createStore } from '@/services/storeService';
import { logStoreAction } from '@/services/auditService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  Store, 
  Save, 
  Loader2, 
  AlertCircle
} from 'lucide-react';
import { NoFranchiseSelected } from '@/components/common/NoFranchiseSelected';

export function StoreCreatePage() {
  const navigate = useNavigate();
  const { currentFranchise, refreshStores } = useFranchise();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    isActive: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentFranchise) {
      setError('Nenhuma franquia selecionada');
      return;
    }

    if (!formData.name.trim()) {
      setError('O nome da loja é obrigatório');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 🔒 FIX BUG-21/33: Use centralized service with maxStores validation
      // instead of inline addDoc
      const storeId = await createStore(
        currentFranchise.id,
        {
          name: formData.name.trim(),
          address: formData.address.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          isActive: formData.isActive,
        },
        user?.uid || '',
      );

      if (user) {
        try {
          await logStoreAction(
            currentFranchise.id,
            'create',
            {
              id: user.uid,
              email: user.email || '',
              name: user.displayName || undefined,
            },
            {
              id: storeId,
              name: formData.name.trim(),
            }
          );
        } catch (auditError) {
          console.warn('[audit] Falha ao registrar criação de loja:', auditError);
        }
      }

      await refreshStores();
      navigate(`/stores/${storeId}`);
    } catch (err) {
      console.error('Error creating store:', err);
      setError('Erro ao criar loja. Tente novamente.');
    }
    
    setIsLoading(false);
  };

  if (!currentFranchise) {
    return <NoFranchiseSelected description="Selecione uma franquia no menu lateral para criar uma loja" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/stores">
          <Button variant="ghost" size="icon" aria-label="Voltar para lojas">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nova Loja</h1>
          <p className="text-muted-foreground">
            Criar uma nova loja em {currentFranchise.name}
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Informações da Loja
            </CardTitle>
            <CardDescription>
              Preencha os dados da nova loja
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">
                Nome da loja <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Loja Centro, Unidade Shopping..."
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Endereço completo da loja"
                rows={2}
                disabled={isLoading}
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
                  disabled={isLoading}
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
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 p-4 border rounded-lg sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label htmlFor="isActive">Loja ativa</Label>
                <p className="text-sm text-muted-foreground">
                  Defina se a loja estará disponível imediatamente
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                disabled={isLoading}
              />
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t sm:flex-row sm:items-center">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Criar Loja
                  </>
                )}
              </Button>
              <Link to="/stores">
                <Button type="button" variant="outline" disabled={isLoading}>
                  Cancelar
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
