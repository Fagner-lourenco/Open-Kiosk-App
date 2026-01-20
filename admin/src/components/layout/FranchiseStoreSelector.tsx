/**
 * ============================================================================
 * FranchiseStoreSelector - Seletor de Franquia/Loja
 * ============================================================================
 * 
 * Componente para selecionar franquia e acessar lojas rapidamente.
 * Mostra estrutura hierárquica Franquia > Lojas.
 * 
 * @author Open Kiosk Project
 * @version 1.1.0
 */

import { useState, useMemo } from 'react';
import { Check, ChevronDown, Building2, Store, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFranchise, Franchise, Store as StoreType } from '@/context/FranchiseContext';
import { useNavigate } from 'react-router-dom';

interface FranchiseStoreSelectorProps {
  className?: string;
}

export function FranchiseStoreSelector({ className }: FranchiseStoreSelectorProps) {
  const {
    franchises,
    currentFranchise,
    stores,
    selectFranchise,
    isLoading,
  } = useFranchise();
  
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [switching, setSwitching] = useState(false);

  // Filtra franquias pelo termo de busca
  const filteredFranchises = useMemo(() => {
    if (!search.trim()) return franchises;
    const searchLower = search.toLowerCase();
    return franchises.filter((franchise) =>
      franchise.name.toLowerCase().includes(searchLower) ||
      franchise.ownerEmail?.toLowerCase().includes(searchLower)
    );
  }, [franchises, search]);

  // Handler para selecionar franquia
  const handleSelectFranchise = async (franchise: Franchise) => {
    if (franchise.id === currentFranchise?.id) {
      setOpen(false);
      return;
    }

    try {
      setSwitching(true);
      await selectFranchise(franchise.id);
      setOpen(false);
      setSearch('');
      navigate('/dashboard');
    } catch (error) {
      console.error('Erro ao selecionar franquia:', error);
    } finally {
      setSwitching(false);
    }
  };

  // Handler para navegar para loja específica
  const handleSelectStore = (store: StoreType) => {
    setOpen(false);
    setSearch('');
    navigate(`/stores/${store.id}`);
  };

  if (isLoading && !currentFranchise) {
    return (
      <div className={cn('px-4 py-3 border-b border-gray-200', className)}>
        <div className="w-full flex items-center justify-center px-3 py-2 bg-gray-50 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!currentFranchise) {
    return null;
  }

  return (
    <div className={cn('px-4 py-3 border-b border-gray-200', className)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            disabled={switching}
            className="w-full justify-between px-3 py-2 h-auto bg-gray-50 hover:bg-gray-100"
          >
            <div className="flex items-center gap-2 min-w-0 text-left">
              <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Franquia
                </p>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {currentFranchise.name}
                </p>
              </div>
            </div>
            {switching ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start">
          {/* Search Input */}
          {franchises.length > 5 && (
            <>
              <div className="px-2 py-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar franquia..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          <div className="max-h-[300px] overflow-y-auto">
            {/* Franquias */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-gray-500">
                Franquias ({filteredFranchises.length})
              </DropdownMenuLabel>
              {filteredFranchises.length === 0 ? (
                <div className="flex flex-col items-center py-4 text-gray-500">
                  <Search className="h-6 w-6 mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma franquia encontrada</p>
                </div>
              ) : (
                filteredFranchises.map((franchise) => (
                  <DropdownMenuItem
                    key={franchise.id}
                    onClick={() => handleSelectFranchise(franchise)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Building2 className={cn(
                      'h-4 w-4',
                      franchise.id === currentFranchise.id 
                        ? 'text-blue-600' 
                        : 'text-gray-400'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {franchise.name}
                      </p>
                      {franchise.ownerEmail && (
                        <p className="text-xs text-gray-500 truncate">
                          {franchise.ownerEmail}
                        </p>
                      )}
                    </div>
                    {franchise.id === currentFranchise.id && (
                      <Check className="h-4 w-4 text-blue-600" />
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuGroup>

            {/* Lojas da Franquia Atual */}
            {stores.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-gray-500">
                    Lojas de {currentFranchise.name}
                  </DropdownMenuLabel>
                  {stores.map((store) => (
                    <DropdownMenuItem
                      key={store.id}
                      onClick={() => handleSelectStore(store)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Store className="h-4 w-4 text-green-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{store.name}</p>
                        {store.address && (
                          <p className="text-xs text-gray-500 truncate">
                            {store.address}
                          </p>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
