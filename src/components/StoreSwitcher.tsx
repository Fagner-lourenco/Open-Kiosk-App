/**
 * ============================================================================
 * StoreSwitcher - Botão de Trocar Loja
 * ============================================================================
 * 
 * Botão compacto para header que mostra loja atual e permite trocar.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState } from 'react';
import { useFranchiseSafe } from '@/context/FranchiseContext';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StoreSelector } from './StoreSelector';
import { Store, ChevronDown, Check, Settings } from 'lucide-react';
import type { StoreInfo } from '@/types/franchise';

interface StoreSwitcherProps {
  variant?: 'default' | 'compact' | 'full';
  showSettings?: boolean;
  onSettingsClick?: () => void;
}

export function StoreSwitcher({ 
  variant = 'default',
  showSettings = false,
  onSettingsClick,
}: StoreSwitcherProps) {
  const { t } = useTranslation();
  const franchiseContext = useFranchiseSafe();
  
  const [showSelector, setShowSelector] = useState(false);

  // Se não está em modo franquia, não renderizar
  if (!franchiseContext) {
    return null;
  }

  const { currentStore, userStores, selectStore } = franchiseContext;

  // Se usuário tem apenas 1 loja, mostrar apenas info (sem dropdown)
  if (userStores.length <= 1) {
    if (!currentStore) return null;
    
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
        <Store className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">
          {currentStore.storeName}
        </span>
      </div>
    );
  }

  const handleQuickSwitch = async (store: StoreInfo) => {
    await selectStore(store.franchiseId, store.storeId);
  };

  // Variante compacta: só ícone
  if (variant === 'compact') {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSelector(true)}
          title={currentStore?.storeName || t('stores.selectStore')}
        >
          <Store className="h-5 w-5" />
        </Button>

        <StoreSelector
          open={showSelector}
          onOpenChange={setShowSelector}
        />
      </>
    );
  }

  // Variante full: dropdown com lista completa
  if (variant === 'full') {
    return (
      <>
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={() => setShowSelector(true)}
        >
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            <span className="truncate">
              {currentStore?.storeName || t('stores.selectStore')}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
        </Button>

        <StoreSelector
          open={showSelector}
          onOpenChange={setShowSelector}
        />
      </>
    );
  }

  // Variante default: dropdown menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <Store className="h-4 w-4" />
          <span className="hidden sm:inline max-w-[150px] truncate">
            {currentStore?.storeName || t('stores.selectStore')}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {t('stores.switchStore')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Quick switch para até 5 lojas */}
        {userStores.slice(0, 5).map((store) => (
          <DropdownMenuItem
            key={`${store.franchiseId}-${store.storeId}`}
            onClick={() => handleQuickSwitch(store)}
            className="cursor-pointer"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="font-medium">{store.storeName}</p>
                  {store.franchiseName && (
                    <p className="text-xs text-gray-500">{store.franchiseName}</p>
                  )}
                </div>
              </div>
              {currentStore?.storeId === store.storeId && (
                <Check className="h-4 w-4 text-blue-600" />
              )}
            </div>
          </DropdownMenuItem>
        ))}

        {/* Ver todas se tiver mais de 5 */}
        {userStores.length > 5 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowSelector(true)}>
              {t('stores.viewAll', { count: userStores.length })}
            </DropdownMenuItem>
          </>
        )}

        {/* Configurações */}
        {showSettings && onSettingsClick && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSettingsClick}>
              <Settings className="h-4 w-4 mr-2" />
              {t('stores.storeSettings')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>

      {/* Modal completo */}
      <StoreSelector
        open={showSelector}
        onOpenChange={setShowSelector}
      />
    </DropdownMenu>
  );
}

export default StoreSwitcher;
