/**
 * ============================================================================
 * StoreLayout — Layout com navegação lateral para sub-rotas da loja
 * ============================================================================
 *
 * Carrega os dados da loja, exibe header + nav lateral + Outlet.
 * Fornece store/franchiseId/storeId via useOutletContext.
 */

import { useEffect } from 'react';
import { Link, NavLink, Outlet, useOutletContext, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { useStoreDetail, type StoreData } from '@/hooks/useStoreDetail';
import { cn } from '@/lib/utils';
import { STORE_NAV_ITEMS, STORE_NAV_GROUPS } from '@/config/storeNavConfig';

/** Mapa de ?tab=X (legado) → sub-rota */
const TAB_TO_ROUTE: Record<string, string> = {
  details: '',
  orders: 'orders',
  operations: 'operations',
  kegs: 'kegs',
  wastage: 'wastage',
  maintenance: 'maintenance',
  products: 'products',
  inventory: 'inventory',
  reports: 'reports',
  settings: 'settings',
  members: 'members',
};

export interface StoreOutletContext {
  store: StoreData;
  franchiseId: string;
  storeId: string;
  refreshStore: () => void;
}

export function useStoreContext() {
  return useOutletContext<StoreOutletContext>();
}

export function StoreLayout() {
  const { storeId } = useParams<{ storeId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { store, isLoading, error, franchiseId, refreshStore } = useStoreDetail(storeId);

  // Legacy redirect: ?tab=orders → /stores/:id/orders
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && storeId && tab in TAB_TO_ROUTE) {
      const subRoute = TAB_TO_ROUTE[tab];
      const editParam = searchParams.get('edit') === 'true' ? '?edit=true' : '';
      navigate(`/stores/${storeId}/${subRoute}${editParam}`, { replace: true });
    }
  }, [searchParams, storeId, navigate]);

  if (isLoading) {
    return <LoadingState className="min-h-[400px]" />;
  }

  if (error && !store) {
    return (
      <div className="space-y-6">
        <ErrorState title="Erro ao carregar loja" description={error} />
        <div className="flex justify-center">
          <Link to="/stores">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para lojas
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!store || !franchiseId || !storeId) return null;

  // Group navigation items
  const groups = Object.entries(STORE_NAV_GROUPS);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="-mx-6 -mt-6 mb-6 border-b border-border/60 bg-card px-6 py-5">
        <div className="flex items-center gap-4">
          <Link to="/stores">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label="Voltar para lojas">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{store.name}</h1>
              <Badge
                variant={store.isActive ? 'default' : 'secondary'}
                className="text-[11px] px-2 py-0"
              >
                {store.isActive ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{store.address || 'Sem endereço'}</p>
          </div>
        </div>
      </div>

      {/* Layout: Side nav + Content */}
      <div className="flex gap-8">
        {/* Side Navigation */}
        <nav className="hidden w-52 shrink-0 md:block" aria-label="Navegação da loja">
          <div className="sticky top-20 space-y-5">
            {groups.map(([groupKey, groupLabel]) => {
              const items = STORE_NAV_ITEMS.filter((item) => item.group === groupKey);
              if (items.length === 0) return null;

              return (
                <div key={groupKey}>
                  {groupKey !== 'overview' && (
                    <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {groupLabel}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavLink
                        key={item.href}
                        to={`/stores/${storeId}/${item.href}`}
                        end={item.href === ''}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                            isActive
                              ? 'bg-primary/10 text-primary shadow-sm shadow-primary/5'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )
                        }
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Mobile Nav (horizontal scroll) */}
        <div className="md:hidden -mx-6 mb-2">
          <div className="flex gap-1 overflow-x-auto px-6 pb-2">
            {STORE_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                to={`/stores/${storeId}/${item.href}`}
                end={item.href === ''}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )
                }
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <Outlet
            context={{ store, franchiseId, storeId, refreshStore } satisfies StoreOutletContext}
          />
        </div>
      </div>
    </div>
  );
}
