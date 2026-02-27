/**
 * ============================================================================
 * UsersPage - Lista de Usuários
 * ============================================================================
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { removeMember as removeMemberService } from '@/services/userService';
import { useFranchise } from '@/context/FranchiseContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Plus, 
  Search, 
  Users, 
  MoreVertical, 
  Eye,
  Mail,
  Shield,
  UserMinus,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { NoFranchiseSelected } from '@/components/common/NoFranchiseSelected';
import { LoadingState } from '@/components/common/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterBar } from '@/components/layout/FilterBar';
import { isOperatorRole } from '@/config/roles';

interface FranchiseMember {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  photoURL?: string;
  addedAt?: string;
  userId?: string;
}

export function UsersPage() {
  const { currentFranchise, refreshFranchises } = useFranchise();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [removeMember, setRemoveMember] = useState<FranchiseMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch members from Firestore subcollection
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['franchise-members', currentFranchise?.id],
    queryFn: async (): Promise<FranchiseMember[]> => {
      if (!currentFranchise) return [];
      
      const membersRef = collection(db, 'franchises', currentFranchise.id, 'members');
      const snapshot = await getDocs(query(membersRef, orderBy('joinedAt', 'desc')));
      
      const fetchedMembers: FranchiseMember[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as FranchiseMember));
      
      // Always include owner if not in members list
      const hasOwner = fetchedMembers.some(m => m.role === 'owner' || m.id === currentFranchise.ownerId);
      if (!hasOwner && currentFranchise.ownerId) {
        const createdAt = currentFranchise.createdAt as any;
        let addedAtStr = new Date().toISOString();
        if (createdAt instanceof Date) {
          addedAtStr = createdAt.toISOString();
        } else if (createdAt && typeof createdAt.toDate === 'function') {
          addedAtStr = createdAt.toDate().toISOString();
        }
        
        fetchedMembers.unshift({
          id: currentFranchise.ownerId,
          userId: currentFranchise.ownerId,
          email: currentFranchise.ownerEmail || 'owner@example.com',
          displayName: 'Proprietário',
          role: 'owner',
          addedAt: addedAtStr,
        });
      }
      
      return fetchedMembers;
    },
    enabled: !!currentFranchise,
    staleTime: 60 * 1000, // 1 minute
  });

  // Change role mutation
  const changeRoleMutation = useMutation({
    mutationFn: async ({ memberId, newRole }: { memberId: string; newRole: string }) => {
      if (!currentFranchise) throw new Error('No franchise selected');
      const { updateMemberRole } = await import('../../services/userService');
      await updateMemberRole(currentFranchise.id, memberId, newRole);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['franchise-members', currentFranchise?.id] });
      refreshFranchises();
    },
    onError: (err) => {
      console.error('Error changing role:', err);
      setError('Erro ao alterar função do usuário');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!currentFranchise) throw new Error('No franchise selected');
      await removeMemberService(currentFranchise.id, memberId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['franchise-members', currentFranchise?.id] });
      refreshFranchises();
      setRemoveMember(null);
    },
    onError: (err) => {
      console.error('Error removing member:', err);
      setError('Erro ao remover usuário');
    },
  });

  const handleChangeRole = (memberId: string, newRole: string) => {
    setError(null);
    changeRoleMutation.mutate({ memberId, newRole });
  };

  const handleRemoveMember = () => {
    if (!removeMember) return;
    setError(null);
    removeMemberMutation.mutate(removeMember.id);
  };

  const filteredMembers = members.filter(member =>
    member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      owner: { label: 'Proprietário', variant: 'default' },
      manager: { label: 'Gerente', variant: 'secondary' },
      operator: { label: 'Operador', variant: 'outline' },
      employee: { label: 'Operador', variant: 'outline' },
      viewer: { label: 'Visualizador', variant: 'outline' },
    };
    return config[role] || { label: role, variant: 'outline' };
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || 'U';
  };

  if (!currentFranchise) {
    return <NoFranchiseSelected description="Selecione uma franquia no menu lateral para gerenciar usuários" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Usuários"
        description={`Membros de ${currentFranchise.name}`}
        actions={
          <Link to="/invitations">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Convidar Usuário
            </Button>
          </Link>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <FilterBar>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar usuários..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </FilterBar>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {loadingMembers ? (
            <LoadingState showLabel label="Carregando usuários..." className="p-12" />
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              {searchQuery ? (
                <>
                  <h3 className="text-lg font-medium text-foreground mb-1">
                    Nenhum usuário encontrado
                  </h3>
                  <p className="text-muted-foreground">
                    Tente buscar com outros termos
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-foreground mb-1">
                    Nenhum usuário
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Convide membros para sua franquia
                  </p>
                  <Link to="/invitations">
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Convidar usuário
                    </Button>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filteredMembers.map((member) => {
                const roleBadge = getRoleBadge(member.role);
                
                return (
                  <div 
                    key={member.id}
                    className="flex flex-col gap-3 p-4 hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <Avatar>
                        <AvatarImage src={member.photoURL} />
                        <AvatarFallback>
                          {getInitials(member.displayName, member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">
                          {member.displayName || 'Sem nome'}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {member.email}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <Badge variant={roleBadge.variant}>
                        <Shield className="mr-1 h-3 w-3" />
                        {roleBadge.label}
                      </Badge>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={changeRoleMutation.isPending} aria-label={`Mais ações para ${member.displayName || member.email}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/users/${member.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              Ver detalhes
                            </Link>
                          </DropdownMenuItem>
                          
                          {member.role !== 'owner' && (
                            <>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <Shield className="mr-2 h-4 w-4" />
                                  Alterar função
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                  <DropdownMenuSubContent>
                                    <DropdownMenuItem
                                      onClick={() => handleChangeRole(member.id, 'manager')}
                                      disabled={member.role === 'manager'}
                                    >
                                      Gerente
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleChangeRole(member.id, 'operator')}
                                      disabled={member.role === 'operator' || member.role === 'employee'}
                                    >
                                      Operador
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleChangeRole(member.id, 'viewer')}
                                      disabled={member.role === 'viewer'}
                                    >
                                      Visualizador
                                    </DropdownMenuItem>
                                  </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                              </DropdownMenuSub>
                              
                              <DropdownMenuSeparator />
                              
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => setRemoveMember(member)}
                              >
                                <UserMinus className="mr-2 h-4 w-4" />
                                Remover usuário
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      {members.length > 0 && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground pt-4 border-t sm:flex-row sm:items-center sm:justify-between">
          <span>
            {filteredMembers.length} de {members.length} usuário(s)
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <span>{members.filter(m => m.role === 'owner').length} proprietário(s)</span>
            <span>{members.filter(m => m.role === 'manager').length} gerente(s)</span>
            <span>{members.filter(m => isOperatorRole(m.role)).length} operador(es)</span>
          </div>
        </div>
      )}

      {/* Remove Member Dialog */}
      <Dialog open={!!removeMember} onOpenChange={() => setRemoveMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover usuário</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover "{removeMember?.displayName || removeMember?.email}" da franquia?
              O usuário perderá acesso a todas as lojas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveMember(null)}
              disabled={removeMemberMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={removeMemberMutation.isPending}
            >
              {removeMemberMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                'Remover usuário'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
