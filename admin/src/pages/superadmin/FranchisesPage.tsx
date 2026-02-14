/**
 * ============================================================================
 * FranchisesPage - Lista de Franquias
 * ============================================================================
 * 
 * Página para gerenciamento de todas as franquias do sistema.
 * Exclusiva para SuperAdmin.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { getPlanBadge, getStatusBadge } from '@/utils/franchise-badges';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, Timestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import {
  Building2,
  Plus,
  Search,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Store,
  Users,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterBar } from '@/components/layout/FilterBar';

interface FranchiseData {
  id: string;
  name: string;
  description?: string;
  ownerEmail?: string;
  ownerId?: string;
  status?: string;
  plan?: string;
  storeCount: number;
  memberCount: number;
  createdAt?: Timestamp;
}

export default function FranchisesPage() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  
  const [franchises, setFranchises] = useState<FranchiseData[]>([]);
  const [filteredFranchises, setFilteredFranchises] = useState<FranchiseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FranchiseData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Carrega franquias
  const loadFranchises = async () => {
    setIsLoading(true);
    
    try {
      const franchisesRef = collection(db, 'franchises');
      const franchisesQuery = query(franchisesRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(franchisesQuery);
      
      const data: FranchiseData[] = [];
      
      for (const docSnap of snapshot.docs) {
        const docData = docSnap.data();
        
        // Conta lojas
        const storesRef = collection(db, `franchises/${docSnap.id}/stores`);
        const storesSnapshot = await getDocs(storesRef);
        
        // Conta membros
        const membersRef = collection(db, `franchises/${docSnap.id}/members`);
        const membersSnapshot = await getDocs(membersRef);
        
        data.push({
          id: docSnap.id,
          name: docData.name || 'Sem nome',
          description: docData.description,
          ownerEmail: docData.ownerEmail,
          ownerId: docData.ownerId,
          status: docData.status || 'active',
          plan: docData.plan || 'trial',
          storeCount: storesSnapshot.size,
          memberCount: membersSnapshot.size,
          createdAt: docData.createdAt,
        });
      }
      
      setFranchises(data);
      setFilteredFranchises(data);
    } catch (error) {
      console.error('Erro ao carregar franquias:', error);
      toast.error('Erro ao carregar franquias');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtro de busca
  useEffect(() => {
    if (!search.trim()) {
      setFilteredFranchises(franchises);
      return;
    }

    const searchLower = search.toLowerCase();
    const filtered = franchises.filter(
      (f) =>
        f.name.toLowerCase().includes(searchLower) ||
        f.ownerEmail?.toLowerCase().includes(searchLower) ||
        f.description?.toLowerCase().includes(searchLower)
    );
    setFilteredFranchises(filtered);
  }, [search, franchises]);

  // Carrega ao montar
  useEffect(() => {
    if (isSuperAdmin) {
      loadFranchises();
    }
  }, [isSuperAdmin]);

  // Delete franchise
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'franchises', deleteTarget.id));
      toast.success(`Franquia "${deleteTarget.name}" excluída com sucesso`);
      setDeleteTarget(null);
      loadFranchises();
    } catch (error) {
      console.error('Erro ao excluir franquia:', error);
      toast.error('Erro ao excluir franquia');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return '-';
    return timestamp.toDate().toLocaleDateString('pt-BR');
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card className="max-w-lg mx-auto">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-yellow-600">
              <AlertCircle className="h-5 w-5" />
              <p>Você não tem permissão para acessar esta página.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Franquias"
        description="Gerencie todas as franquias do sistema"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadFranchises} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button onClick={() => navigate('/superadmin/franchises/new')}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Franquia
            </Button>
          </div>
        }
      />

      {/* Search */}
      <FilterBar>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </FilterBar>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Franquias ({filteredFranchises.length})
          </CardTitle>
          <CardDescription>
            Lista de todas as franquias cadastradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredFranchises.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {search ? 'Nenhuma franquia encontrada' : 'Nenhuma franquia cadastrada'}
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px]" aria-label="Tabela de franquias">
                <TableHeader>
                  <TableRow>
                    <TableHead>Franquia</TableHead>
                    <TableHead>Proprietário</TableHead>
                    <TableHead className="text-center">Lojas</TableHead>
                    <TableHead className="text-center">Membros</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFranchises.map((franchise) => (
                    <TableRow key={franchise.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted rounded-lg">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{franchise.name}</p>
                            {franchise.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {franchise.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {franchise.ownerEmail || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Store className="h-4 w-4 text-muted-foreground" />
                          <span>{franchise.storeCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{franchise.memberCount}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(franchise.status)}>
                          {franchise.status === 'active' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPlanBadge(franchise.plan)}>
                          {franchise.plan}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(franchise.createdAt)}
                      </TableCell>
                      <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Acoes para franquia ${franchise.name}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => navigate(`/superadmin/franchises/${franchise.id}`)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => navigate(`/superadmin/franchises/${franchise.id}/edit`)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteTarget(franchise)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Excluir Franquia"
        description={
          <>
            Tem certeza que deseja excluir a franquia "{deleteTarget?.name}"? Esta ação não pode
            ser desfeita e excluira lojas, pedidos, membros e configurações associados.
          </>
        }
        onConfirm={handleDelete}
        isConfirming={isDeleting}
        confirmLabel="Excluir"
        confirmingLabel="Excluindo..."
      />
    </div>
  );
}
