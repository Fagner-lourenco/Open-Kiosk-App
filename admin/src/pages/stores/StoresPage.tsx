/**
 * ============================================================================
 * StoresPage - Lista de Lojas
 * ============================================================================
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Plus, 
  Search, 
  Store, 
  MoreVertical, 
  Edit, 
  Trash2,
  Eye,
  MapPin,
  Users,
  Building2,
  Loader2
} from 'lucide-react';

export function StoresPage() {
  const { currentFranchise, stores, loading, refreshStores } = useFranchise();
  const { isSuperAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteStoreId, setDeleteStoreId] = useState<string | null>(null);
  const [deleteStoreName, setDeleteStoreName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteStore = async () => {
    if (!currentFranchise || !deleteStoreId) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, `franchises/${currentFranchise.id}/stores/${deleteStoreId}`));
      await refreshStores();
      setDeleteStoreId(null);
    } catch (error) {
      console.error('Error deleting store:', error);
    }
    setIsDeleting(false);
  };

  const openDeleteDialog = (storeId: string, storeName: string) => {
    setDeleteStoreId(storeId);
    setDeleteStoreName(storeName);
  };

  const filteredStores = stores.filter(store =>
    store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    store.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!currentFranchise) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <CardTitle>Nenhuma franquia selecionada</CardTitle>
            <CardDescription>
              Selecione uma franquia no menu lateral para gerenciar lojas
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
          <h1 className="text-2xl font-bold text-gray-900">Lojas</h1>
          <p className="text-gray-500">
            Gerencie as lojas de {currentFranchise.name}
          </p>
        </div>
        {isSuperAdmin && (
          <Link to="/stores/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Loja
            </Button>
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar lojas..."
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stores Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredStores.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Store className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            {searchQuery ? (
              <>
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  Nenhuma loja encontrada
                </h3>
                <p className="text-gray-500">
                  Tente buscar com outros termos
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  Nenhuma loja cadastrada
                </h3>
                <p className="text-gray-500 mb-4">
                  {isSuperAdmin 
                    ? 'Comece criando sua primeira loja'
                    : 'Esta franquia ainda não possui lojas'}
                </p>
                {isSuperAdmin && (
                  <Link to="/stores/new">
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Criar primeira loja
                    </Button>
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredStores.map((store) => (
            <Card key={store.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100">
                      <Store className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{store.name}</CardTitle>
                      <Badge 
                        variant={store.isActive !== false ? 'default' : 'secondary'}
                        className="mt-1"
                      >
                        {store.isActive !== false ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/stores/${store.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver detalhes
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={`/stores/${store.id}?edit=true`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </Link>
                      </DropdownMenuItem>
                      {isSuperAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => openDeleteDialog(store.id, store.name)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 text-sm text-gray-500">
                  {store.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate">{store.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{store.members?.length || 1} membro(s)</span>
                  </div>
                </div>
                <Link to={`/stores/${store.id}`}>
                  <Button variant="outline" className="w-full mt-4">
                    Gerenciar
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Stats */}
      {stores.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t">
          <span>
            {filteredStores.length} de {stores.length} loja(s)
          </span>
          <span>
            {stores.filter(s => s.isActive !== false).length} ativa(s)
          </span>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteStoreId} onOpenChange={() => setDeleteStoreId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir loja</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a loja "{deleteStoreName}"?
              Esta ação não pode ser desfeita e todos os dados serão perdidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteStoreId(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteStore}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir loja'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
