/**
 * ============================================================================
 * UsersPage - Lista de Usuários
 * ============================================================================
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, doc, updateDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Building2,
  Shield,
  UserMinus,
  Loader2,
  AlertCircle
} from 'lucide-react';

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const memberRef = doc(db, 'franchises', currentFranchise.id, 'members', memberId);
      await updateDoc(memberRef, { role: newRole, updatedAt: new Date() });
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
      await deleteDoc(doc(db, 'franchises', currentFranchise.id, 'members', memberId));
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
      employee: { label: 'Funcionário', variant: 'outline' },
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
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <CardTitle>Nenhuma franquia selecionada</CardTitle>
            <CardDescription>
              Selecione uma franquia no menu lateral para gerenciar usuários
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
          <p className="text-gray-500">
            Membros de {currentFranchise.name}
          </p>
        </div>
        <Link to="/invitations">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Convidar Usuário
          </Button>
        </Link>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar usuários..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {loadingMembers ? (
            <div className="p-12 text-center">
              <Loader2 className="h-8 w-8 mx-auto text-gray-400 mb-4 animate-spin" />
              <p className="text-gray-500">Carregando usuários...</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              {searchQuery ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    Nenhum usuário encontrado
                  </h3>
                  <p className="text-gray-500">
                    Tente buscar com outros termos
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    Nenhum usuário
                  </h3>
                  <p className="text-gray-500 mb-4">
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
                    className="flex items-center justify-between p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={member.photoURL} />
                        <AvatarFallback>
                          {getInitials(member.displayName, member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-gray-900">
                          {member.displayName || 'Sem nome'}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
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
                          <Button variant="ghost" size="icon" disabled={changeRoleMutation.isPending}>
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
                                      onClick={() => handleChangeRole(member.id, 'employee')}
                                      disabled={member.role === 'employee'}
                                    >
                                      Funcionário
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
        <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t">
          <span>
            {filteredMembers.length} de {members.length} usuário(s)
          </span>
          <div className="flex items-center gap-4">
            <span>{members.filter(m => m.role === 'owner').length} proprietário(s)</span>
            <span>{members.filter(m => m.role === 'manager').length} gerente(s)</span>
            <span>{members.filter(m => m.role === 'employee').length} funcionário(s)</span>
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
