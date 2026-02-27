/**
 * ============================================================================
 * SuperAdmin Dashboard
 * ============================================================================
 * 
 * Dashboard exclusivo para super admins.
 * Mostra visão geral de todas as franquias.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPlanBadge, getStatusBadge } from '@/utils/franchise-badges';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useFranchise } from '@/context/FranchiseContext';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Building2,
  Users,
  Store,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Eye,
  Settings,
  Shield,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/layout/PageHeader';

interface FranchiseStats {
  id: string;
  name: string;
  ownerEmail?: string;
  ownerId?: string;
  status?: string;
  plan?: string;
  storeCount: number;
  memberCount: number;
  createdAt?: Timestamp;
}

export default function SuperAdminDashboard() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const { selectFranchise, refreshFranchises } = useFranchise();
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // React Query — cache superadmin data
  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: async () => {
      // Carrega todas as franquias
      const franchisesRef = collection(db, 'franchises');
      const franchisesQuery = query(franchisesRef, orderBy('createdAt', 'desc'));
      const franchisesSnapshot = await getDocs(franchisesQuery);
      
      const franchiseData: FranchiseStats[] = [];
      let totalStores = 0;
      let totalUsers = 0;
      const planCounts: Record<string, number> = {};
      
      const enriched = await Promise.all(
        franchisesSnapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          const [storesSnap, membersSnap] = await Promise.all([
            getDocs(collection(db, `franchises/${docSnap.id}/stores`)),
            getDocs(collection(db, `franchises/${docSnap.id}/members`)),
          ]);
          return { docSnap, data, storeCount: storesSnap.size, memberCount: membersSnap.size };
        })
      );

      for (const { docSnap, data, storeCount, memberCount } of enriched) {
        totalStores += storeCount;
        totalUsers += memberCount;
        
        const plan = data.plan || 'trial';
        planCounts[plan] = (planCounts[plan] || 0) + 1;
        
        franchiseData.push({
          id: docSnap.id,
          name: data.name || 'Sem nome',
          ownerEmail: data.ownerEmail,
          ownerId: data.ownerId,
          status: data.status || 'active',
          plan,
          storeCount,
          memberCount,
          createdAt: data.createdAt,
        });
      }

      return {
        franchises: franchiseData,
        stats: {
          totalFranchises: franchiseData.length,
          totalStores,
          totalUsers,
          activePlans: planCounts,
        },
      };
    },
    enabled: !!isSuperAdmin,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: 2,
  });

  const franchises = data?.franchises ?? [];
  const stats = data?.stats ?? { totalFranchises: 0, totalStores: 0, totalUsers: 0, activePlans: {} };
  const error = loadError ? (loadError instanceof Error ? loadError.message : 'Erro ao carregar dados.') : actionError;

  // Handlers para os botões de ação com tratamento de erro

  const handleViewFranchise = async (franchiseId: string) => {
    try {
      setActionLoading(franchiseId);
      setActionError(null);
      const updatedFranchises = await refreshFranchises();
      await selectFranchise(franchiseId, updatedFranchises);
      navigate('/dashboard');
    } catch (err) {
      console.error('Erro ao visualizar franquia:', err);
      setActionError('Erro ao acessar a franquia. Tente novamente.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfigureFranchise = async (franchiseId: string) => {
    try {
      setActionLoading(franchiseId);
      setActionError(null);
      const updatedFranchises = await refreshFranchises();
      await selectFranchise(franchiseId, updatedFranchises);
      navigate('/settings');
    } catch (err) {
      console.error('Erro ao configurar franquia:', err);
      setActionError('Erro ao acessar as configurações. Tente novamente.');
    } finally {
      setActionLoading(null);
    }
  };

  // Redireciona se não for super admin
  if (!authLoading && !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return '-';
    return timestamp.toDate().toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Super Admin Dashboard"
        description="Visão geral de todas as franquias da plataforma"
        meta={
          <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">
            <Shield className="mr-1 h-3 w-3" />
            Super Admin
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => refetch()} disabled={isLoading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button onClick={() => navigate('/superadmin/franchises')}>
              <Building2 className="h-4 w-4 mr-2" />
              Gerenciar Franquias
            </Button>
          </div>
        }
      />

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Franquias</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats.totalFranchises}</div>
            )}
            <p className="text-xs text-muted-foreground">Total de franquias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lojas</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats.totalStores}</div>
            )}
            <p className="text-xs text-muted-foreground">Total de lojas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
            )}
            <p className="text-xs text-muted-foreground">Total de membros</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planos</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <div className="flex flex-wrap gap-1">
                {Object.entries(stats.activePlans).map(([plan, count]) => (
                  <Badge key={plan} variant="secondary" className="text-xs">
                    {plan}: {count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Franchises Table */}
      <Card>
        <CardHeader>
          <CardTitle>Todas as Franquias</CardTitle>
          <CardDescription>
            Lista completa de franquias cadastradas na plataforma
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : franchises.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma franquia encontrada
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[700px]" aria-label="Lista de franquias">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Owner</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Lojas</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Membros</TableHead>
                    <TableHead className="hidden lg:table-cell">Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {franchises.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        Nenhuma franquia cadastrada.
                      </TableCell>
                    </TableRow>
                  )}
                  {franchises.map((franchise) => (
                    <TableRow key={franchise.id}>
                      <TableCell className="font-medium">
                        {franchise.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {franchise.ownerEmail || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getPlanBadge(franchise.plan)}>
                          {franchise.plan || 'trial'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(franchise.status)}>
                          {franchise.status || 'active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {franchise.storeCount}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        {franchise.memberCount}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {formatDate(franchise.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            title="Visualizar"
                            aria-label={`Visualizar franquia ${franchise.name}`}
                            disabled={actionLoading === franchise.id}
                            onClick={() => handleViewFranchise(franchise.id)}
                          >
                            {actionLoading === franchise.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            title="Configurar"
                            aria-label={`Configurar franquia ${franchise.name}`}
                            disabled={actionLoading === franchise.id}
                            onClick={() => handleConfigureFranchise(franchise.id)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
