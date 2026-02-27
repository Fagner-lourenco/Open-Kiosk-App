/**
 * ============================================================================
 * StoresPage - Lista de Lojas
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, getDocs, Timestamp, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import { deleteStore } from '@/services/storeService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterBar } from '@/components/layout/FilterBar';
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
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { NoFranchiseSelected } from '@/components/common/NoFranchiseSelected';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ordersPath } from '@/lib/pathResolver';

// ---------------------------------------------------------------------------
// Mini sparkline + KPI for each store card
// ---------------------------------------------------------------------------
function StoreSparkline({ franchiseId, storeId }: { franchiseId: string; storeId: string }) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const { data } = useQuery({
    queryKey: ['store-sparkline', franchiseId, storeId],
    queryFn: async () => {
      const path = ordersPath(franchiseId, storeId);
      const segments = path.split('/') as [string, ...string[]];
      const ordersRef = collection(db, ...segments);
      const q = query(
        ordersRef,
        where('timestamp', '>=', Timestamp.fromDate(sevenDaysAgo)),
        where('paymentStatus', '==', 'paid'),
        orderBy('timestamp', 'asc'),
        firestoreLimit(500)
      );
      const snap = await getDocs(q);
      
      // Group by day
      const byDay: Record<string, number> = {};
      let total = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        const ts: Date = data.timestamp?.toDate?.() || new Date();
        const key = `${ts.getMonth() + 1}/${ts.getDate()}`;
        byDay[key] = (byDay[key] || 0) + (data.total || 0);
        total += data.total || 0;
      });

      // Fill the 7 days
      const chartData: { d: string; v: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const dt = new Date();
        dt.setDate(dt.getDate() - i);
        const key = `${dt.getMonth() + 1}/${dt.getDate()}`;
        chartData.push({ d: key, v: byDay[key] || 0 });
      }

      // Trend: compare last 3 days vs first 4 days
      const first = chartData.slice(0, 4).reduce((s, c) => s + c.v, 0);
      const last = chartData.slice(4).reduce((s, c) => s + c.v, 0);
      const trend = first > 0 ? ((last - first * (3 / 4)) / (first * (3 / 4))) * 100 : 0;

      return { chartData, total, trend, orderCount: snap.docs.length };
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  if (!data || data.orderCount === 0) return null;

  const isUp = data.trend >= 0;

  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">7 dias</span>
        <span className="font-medium">
          R$ {data.total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.chartData}>
              <defs>
                <linearGradient id={`spark-${storeId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={isUp ? '#22c55e' : '#ef4444'}
                strokeWidth={1.5}
                fill={`url(#spark-${storeId})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className={`flex items-center text-[10px] font-medium ${isUp ? 'text-green-600' : 'text-red-500'}`}>
          {isUp ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
          {Math.abs(data.trend).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}

export function StoresPage() {
  const PAGE_SIZE = 20;
  const { currentFranchise, stores, loading, refreshStores } = useFranchise();
  const { isSuperAdmin } = useAuth();
  const { log: audit } = useAudit();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [deleteStoreId, setDeleteStoreId] = useState<string | null>(null);
  const [deleteStoreName, setDeleteStoreName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteStore = async () => {
    if (!currentFranchise || !deleteStoreId) return;
    
    setIsDeleting(true);
    try {
      // [FIX BUG-S1] Usar deleteStore com cascade delete de subcoleções
      await deleteStore(currentFranchise.id, deleteStoreId);
      const store = stores.find(s => s.id === deleteStoreId);
      audit(AuditActions.STORE_DELETE, { type: 'store', id: deleteStoreId, name: store?.name || deleteStoreName }, { deletedFrom: 'stores_list' });
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

  const totalPages = Math.max(1, Math.ceil(filteredStores.length / PAGE_SIZE));
  const paginatedStores = filteredStores.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, currentFranchise?.id]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (!currentFranchise) {
    return <NoFranchiseSelected description="Selecione uma franquia no menu lateral para gerenciar lojas" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lojas"
        description={`Gerencie as lojas de ${currentFranchise.name}`}
        actions={
          isSuperAdmin ? (
            <Link to="/stores/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Loja
              </Button>
            </Link>
          ) : null
        }
      />

      <FilterBar>
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lojas..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Buscar lojas"
          />
        </div>
      </FilterBar>

      {/* Stores Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-3/4 mb-4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredStores.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Store className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            {searchQuery ? (
              <>
                <h3 className="text-lg font-medium text-foreground mb-1">
                  Nenhuma loja encontrada
                </h3>
                <p className="text-muted-foreground">
                  Tente buscar com outros termos
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-foreground mb-1">
                  Nenhuma loja cadastrada
                </h3>
                <p className="text-muted-foreground mb-4">
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
          {paginatedStores.map((store) => (
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
                        <Button variant="ghost" size="icon" aria-label={`Acoes para loja ${store.name}`}>
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
                <div className="space-y-2 text-sm text-muted-foreground">
                  {store.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate">{store.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{store.operators?.length || 1} membro(s)</span>
                  </div>
                </div>
                <StoreSparkline franchiseId={currentFranchise!.id} storeId={store.id} />
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

      {filteredStores.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={filteredStores.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          ariaLabel="Paginação de lojas"
        />
      )}

      {/* Stats */}
      {stores.length > 0 && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            {filteredStores.length} de {stores.length} loja(s)
          </span>
          <span>
            {stores.filter(s => s.isActive !== false).length} ativa(s)
          </span>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={!!deleteStoreId}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteStoreId(null);
            setDeleteStoreName('');
          }
        }}
        title="Excluir loja"
        description={
          <>
            Tem certeza que deseja excluir a loja "{deleteStoreName}"? Esta ação não pode ser
            desfeita e todos os dados relacionados (pedidos, estoque, configurações e membros)
            serão perdidos.
          </>
        }
        onConfirm={handleDeleteStore}
        isConfirming={isDeleting}
        confirmLabel="Excluir loja"
        confirmingLabel="Excluindo..."
      />
    </div>
  );
}
