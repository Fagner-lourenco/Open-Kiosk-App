/**
 * ============================================================================
 * StoreSelectPage - Página de Seleção de Loja
 * ============================================================================
 * 
 * Página dedicada para usuários com acesso a múltiplas lojas.
 * Exibida após login quando user.storeAccess.length > 1.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useFranchise } from '@/context/FranchiseContext';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Store, 
  Search, 
  LogOut, 
  MapPin, 
  Check,
  Building2,
  Loader2
} from 'lucide-react';
import type { StoreInfo, UserRole } from '@/types/franchise';

/**
 * Helper para obter cor do badge por role
 */
function getRoleBadgeColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    owner: 'bg-purple-100 text-purple-800',
    admin: 'bg-blue-100 text-blue-800',
    manager: 'bg-green-100 text-green-800',
    operator: 'bg-yellow-100 text-yellow-800',
    employee: 'bg-yellow-100 text-yellow-800',
    technician: 'bg-orange-100 text-orange-800',
  };
  return colors[role] || 'bg-gray-100 text-gray-800';
}

/**
 * Helper para obter label do role
 */
function getRoleLabel(role: UserRole, t: (key: string) => string): string {
  return t(`roles.${role}`);
}

export function StoreSelectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { userStores, currentStore, selectStore, isLoading } = useFranchise();

  const [searchTerm, setSearchTerm] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);

  // Redireciona se não autenticado
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  // Redireciona se tem apenas 1 loja
  useEffect(() => {
    if (!isLoading && userStores.length === 1) {
      handleSelectStore(userStores[0]);
    }
  }, [isLoading, userStores]);

  // Filtrar lojas pela busca
  const filteredStores = userStores.filter(store => 
    store.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.franchiseName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Selecionar loja
  const handleSelectStore = async (store: StoreInfo) => {
    setIsSelecting(true);
    try {
      await selectStore(store.franchiseId, store.storeId);
      
      // Redireciona baseado no role
      const role = store.role;
      if (role === 'operator' || role === 'employee') {
        navigate('/shop');
      } else if (role === 'technician') {
        navigate('/admin?tab=esp32');
      } else {
        navigate('/admin');
      }
    } catch (error) {
      console.error('Error selecting store:', error);
    } finally {
      setIsSelecting(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">{t('stores.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('stores.selectTitle')}
            </h1>
            <p className="text-gray-500 mt-1">
              {t('stores.selectSubtitle')}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {user.displayName || user.email}
                </p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title={t('auth.logout')}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Search */}
        {userStores.length > 3 && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder={t('stores.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white"
            />
          </div>
        )}

        {/* Stores Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredStores.map((store) => (
            <Card 
              key={`${store.franchiseId}-${store.storeId}`}
              className={`cursor-pointer transition-all hover:shadow-lg hover:border-blue-300 ${
                currentStore?.storeId === store.storeId 
                  ? 'border-blue-500 bg-blue-50' 
                  : ''
              }`}
              onClick={() => handleSelectStore(store)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Store className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{store.storeName}</CardTitle>
                      {store.franchiseName && (
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <Building2 className="h-3 w-3" />
                          {store.franchiseName}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  
                  {currentStore?.storeId === store.storeId && (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="flex items-center justify-between">
                  {store.address && (
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate max-w-[200px]">{store.address}</span>
                    </div>
                  )}
                  
                  <Badge className={getRoleBadgeColor(store.role)}>
                    {getRoleLabel(store.role, t)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredStores.length === 0 && (
          <div className="text-center py-12">
            <Store className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm 
                ? t('stores.noSearchResults') 
                : t('stores.noStoresAccess')
              }
            </h3>
            {searchTerm && (
              <Button variant="ghost" onClick={() => setSearchTerm('')}>
                {t('stores.clearSearch')}
              </Button>
            )}
          </div>
        )}

        {/* Loading Overlay */}
        {isSelecting && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
              <p className="mt-2 text-gray-600">{t('stores.entering')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StoreSelectPage;
