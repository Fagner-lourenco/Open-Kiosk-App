/**
 * ============================================================================
 * StoreCreatePage - Criar Nova Loja
 * ============================================================================
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
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
  AlertCircle,
  Building2
} from 'lucide-react';

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
      const storeData = {
        name: formData.name.trim(),
        address: formData.address.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        isActive: formData.isActive,
        franchiseId: currentFranchise.id,
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        members: [],
        settings: {},
      };

      const docRef = await addDoc(
        collection(db, `franchises/${currentFranchise.id}/stores`),
        storeData
      );

      await refreshStores();
      navigate(`/stores/${docRef.id}`);
    } catch (err) {
      console.error('Error creating store:', err);
      setError('Erro ao criar loja. Tente novamente.');
    }
    
    setIsLoading(false);
  };

  if (!currentFranchise) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <CardTitle>Nenhuma franquia selecionada</CardTitle>
            <CardDescription>
              Selecione uma franquia no menu lateral para criar uma loja
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/stores">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nova Loja</h1>
          <p className="text-gray-500">
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

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="isActive">Loja ativa</Label>
                <p className="text-sm text-gray-500">
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

            <div className="flex items-center gap-4 pt-4 border-t">
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
