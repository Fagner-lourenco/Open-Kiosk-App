/**
 * ============================================================================
 * SuperAdmin Dashboard
 * ============================================================================
 * 
 * Dashboard exclusivo para super admins.
 * Mostra visão geral de todas as franquias.
 */

import { useState, useEffect } from 'react';
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

interface PlatformStats {
  totalFranchises: number;
  totalStores: number;
  totalUsers: number;
  activePlans: Record<string, number>;
}

export default function SuperAdminDashboard() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const { selectFranchise, refreshFranchises } = useFranchise();
  const navigate = useNavigate();
  const [franchises, setFranchises] = useState<FranchiseStats[]>([]);
  const [stats, setStats] = useState<PlatformStats>({
    totalFranchises: 0,
    totalStores: 0,
    totalUsers: 0,
    activePlans: {},
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Handlers para os botões de ação com tratamento de erro
  const handleViewFranchise = async (franchiseId: string) => {
    try {
      setActionLoading(franchiseId);
      setError(null);
      // Atualiza lista de franquias e recebe a lista atualizada
      const updatedFranchises = await refreshFranchises();
      // Passa a lista atualizada para evitar race condition
      await selectFranchise(franchiseId, updatedFranchises);
      navigate('/dashboard');
    } catch (err) {
      console.error('Erro ao visualizar franquia:', err);
      setError('Erro ao acessar a franquia. Tente novamente.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfigureFranchise = async (franchiseId: string) => {
    try {
      setActionLoading(franchiseId);
      setError(null);
      // Atualiza lista de franquias e recebe a lista atualizada
      const updatedFranchises = await refreshFranchises();
      // Passa a lista atualizada para evitar race condition
      await selectFranchise(franchiseId, updatedFranchises);
      navigate('/settings');
    } catch (err) {
      console.error('Erro ao configurar franquia:', err);
      setError('Erro ao acessar as configurações. Tente novamente.');
    } finally {
      setActionLoading(null);
    }
  };

  // Carrega dados das franquias
  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Carrega todas as franquias
      const franchisesRef = collection(db, 'franchises');
      const franchisesQuery = query(franchisesRef, orderBy('createdAt', 'desc'));
      const franchisesSnapshot = await getDocs(franchisesQuery);
      
      const franchiseData: FranchiseStats[] = [];
      let totalStores = 0;
      let totalUsers = 0;
      const planCounts: Record<string, number> = {};
      
      for (const docSnap of franchisesSnapshot.docs) {
        const data = docSnap.data();
        
        // Conta lojas
        const storesRef = collection(db, `franchises/${docSnap.id}/stores`);
        const storesSnapshot = await getDocs(storesRef);
        const storeCount = storesSnapshot.size;
        totalStores += storeCount;
        
        // Conta membros
        const membersRef = collection(db, `franchises/${docSnap.id}/members`);
        const membersSnapshot = await getDocs(membersRef);
        const memberCount = membersSnapshot.size;
        totalUsers += memberCount;
        
        // Conta planos
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
      
      setFranchises(franchiseData);
      setStats({
        totalFranchises: franchiseData.length,
        totalStores,
        totalUsers,
        activePlans: planCounts,
      });
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError('Erro ao carregar dados. Verifique suas permissões.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin]);

  // Redireciona se não for super admin
  if (!authLoading && !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return '-';
    return timestamp.toDate().toLocaleDateString('pt-BR');
  };

  const getPlanBadge = (plan?: string) => {
    const planColors: Record<string, string> = {
      trial: 'bg-yellow-100 text-yellow-800',
      basic: 'bg-blue-100 text-blue-800',
      professional: 'bg-purple-100 text-purple-800',
      enterprise: 'bg-green-100 text-green-800',
    };
    return planColors[plan || 'trial'] || planColors.trial;
  };

  const getStatusBadge = (status?: string) => {
    return status === 'active' 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Shield className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Visão geral de todas as franquias da plataforma
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button onClick={loadData} disabled={isLoading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button onClick={() => navigate('/superadmin/franchises')}>
            <Building2 className="h-4 w-4 mr-2" />
            Gerenciar Franquias
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lojas</TableHead>
                  <TableHead className="text-right">Membros</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {franchises.map((franchise) => (
                  <TableRow key={franchise.id}>
                    <TableCell className="font-medium">
                      {franchise.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
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
                    <TableCell className="text-right">
                      {franchise.memberCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
