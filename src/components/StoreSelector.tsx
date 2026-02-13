/**
 * ============================================================================
 * StoreSelector - Seletor de Loja
 * ============================================================================
 * 
 * Modal/Dropdown para selecionar qual loja gerenciar.
 * Aparece após login se usuário tem acesso a múltiplas lojas.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useMemo } from 'react';
import { useFranchise } from '@/context/FranchiseContext';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Store, 
  Search, 
  MapPin, 
  Check, 
  Building2,
  Loader2 
} from 'lucide-react';
import type { StoreInfo, UserRole } from '@/types/franchise';

interface StoreSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores?: StoreInfo[];
  currentStoreId?: string;
  onSelect?: (store: StoreInfo) => void;
  title?: string;
  description?: string;
  showSearch?: boolean;
  allowClose?: boolean;
}

// Helpers
function getRoleBadgeColor(role: string): string {
  const colors: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-blue-100 text-blue-700',
    manager: 'bg-green-100 text-green-700',
    operator: 'bg-yellow-100 text-yellow-700',
    technician: 'bg-orange-100 text-orange-700',
  };
  return colors[role] || 'bg-gray-100 text-gray-700';
}

function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    superadmin: 'Super Admin',
    owner: 'Proprietário',
    admin: 'Administrador',
    manager: 'Gerente',
    operator: 'Operador',
    employee: 'Funcionário',
    technician: 'Técnico',
    viewer: 'Visualizador',
  };
  return labels[role] || role;
}

export function StoreSelector({
  open,
  onOpenChange,
  stores: propStores,
  currentStoreId,
  onSelect,
  title,
  description,
  showSearch = true,
  allowClose = true,
}: StoreSelectorProps) {
  const { t } = useTranslation();
  const { userStores, selectStore, currentStore, isLoading } = useFranchise();
  
  const [search, setSearch] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);

  // Usar stores do prop ou do contexto
  const stores = propStores || userStores;
  const selectedId = currentStoreId || currentStore?.storeId;

  // Filtrar lojas
  const filteredStores = useMemo(() => {
    if (!search.trim()) return stores;
    
    const searchLower = search.toLowerCase();
    return stores.filter(store => 
      store.storeName.toLowerCase().includes(searchLower) ||
      store.storeId.toLowerCase().includes(searchLower) ||
      store.franchiseName?.toLowerCase().includes(searchLower)
    );
  }, [stores, search]);

  const handleSelect = async (store: StoreInfo) => {
    setIsSelecting(true);
    
    try {
      if (onSelect) {
        onSelect(store);
      } else {
        await selectStore(store.franchiseId, store.storeId);
      }
      onOpenChange(false);
    } finally {
      setIsSelecting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !allowClose && !selectedId) {
      return; // Não permite fechar sem selecionar
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            {title || t('stores.selectStore')}
          </DialogTitle>
          <DialogDescription>
            {description || t('stores.selectStoreDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Busca */}
          {showSearch && stores.length > 5 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('stores.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {/* Lista de Lojas */}
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : filteredStores.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {search 
                  ? t('stores.noResults')
                  : t('stores.noStores')
                }
              </div>
            ) : (
              filteredStores.map((store) => (
                <button
                  key={`${store.franchiseId}-${store.storeId}`}
                  onClick={() => handleSelect(store)}
                  disabled={isSelecting}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all
                    ${selectedId === store.storeId 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                    }
                    ${isSelecting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedId === store.storeId 
                          ? 'bg-blue-100' 
                          : 'bg-gray-100'
                      }`}>
                        <Store className={`h-5 w-5 ${
                          selectedId === store.storeId 
                            ? 'text-blue-600' 
                            : 'text-gray-500'
                        }`} />
                      </div>
                      
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {store.storeName}
                        </h3>
                        
                        {store.franchiseName && (
                          <p className="text-sm text-gray-500">
                            {store.franchiseName}
                          </p>
                        )}
                        
                        {store.storeId && (
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            ID: {store.storeId}
                          </p>
                        )}
                      </div>
                    </div>

                    {selectedId === store.storeId && (
                      <Check className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    )}
                  </div>

                  {/* Role badge */}
                  {store.role && (
                    <div className="mt-2 ml-12">
                      <span className={`text-xs px-2 py-1 rounded-full ${getRoleBadgeColor(store.role)}`}>
                        {getRoleLabel(store.role)}
                      </span>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        {allowClose && selectedId && (
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default StoreSelector;
