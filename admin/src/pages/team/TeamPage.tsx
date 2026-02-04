/**
 * ============================================================================
 * TeamPage - Equipe (Membros + Convites Unificados)
 * ============================================================================
 * 
 * Página unificada para gerenciar membros da franquia e convites pendentes.
 * Substitui as antigas UsersPage e InvitationsPage.
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  addDoc,
  query, 
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateInvitationToken } from '@/lib/invitationToken';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Copy,
  Send,
  UsersRound
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

interface Invitation {
  id: string;
  token?: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  createdAt: Date;
  expiresAt: Date;
  invitedBy: string;
  invitedByName?: string;
}

export function TeamPage() {
  const { currentFranchise, refreshFranchises } = useFranchise();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Tab state from URL
  const activeTab = searchParams.get('tab') || 'members';
  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  // Member states
  const [searchQuery, setSearchQuery] = useState('');
  const [removeMember, setRemoveMember] = useState<FranchiseMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invitation states
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('employee');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

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
    staleTime: 60 * 1000,
  });

  // Fetch invitations
  const { data: invitations = [], isLoading: loadingInvitations } = useQuery({
    queryKey: ['invitations', currentFranchise?.id],
    queryFn: async (): Promise<Invitation[]> => {
      if (!currentFranchise) return [];
      
      const snapshot = await getDocs(
        query(
          collection(db, 'invitations'),
          where('franchiseId', '==', currentFranchise.id)
        )
      );
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          token: data.token,
          email: data.email,
          role: data.role,
          status: data.status,
          createdAt: data.createdAt?.toDate() || new Date(),
          expiresAt: data.expiresAt?.toDate() || new Date(),
          invitedBy: data.invitedBy,
          invitedByName: data.invitedByName,
        };
      });
    },
    enabled: !!currentFranchise,
  });

  // Pending invitations count for badge
  const pendingCount = invitations.filter(
    i => i.status === 'pending' && i.expiresAt > new Date()
  ).length;

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

  // Create invitation mutation
  const createInviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!currentFranchise || !user) throw new Error('Dados inválidos');
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      const inviteData = {
        franchiseId: currentFranchise.id,
        franchiseName: currentFranchise.name,
        email: email.toLowerCase(),
        role,
        status: 'pending',
        invitedBy: user.uid,
        invitedByName: user.displayName || user.email,
        token: generateInvitationToken(),
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
      };
      
      const docRef = await addDoc(collection(db, 'invitations'), inviteData);
      return docRef.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setShowInviteDialog(false);
      setInviteEmail('');
      setInviteRole('employee');
    },
    onError: (err: any) => {
      setError(err.message || 'Erro ao criar convite');
    },
  });

  // Revoke invitation mutation
  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await updateDoc(doc(db, 'invitations', inviteId), {
        status: 'revoked',
        revokedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
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

  const handleCreateInvite = () => {
    if (!inviteEmail) {
      setError('Email é obrigatório');
      return;
    }
    setError(null);
    createInviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const copyInviteLink = (invite: Invitation) => {
    const link = invite.token
      ? `${window.location.origin}/invite/${invite.token}`
      : `${window.location.origin}/invite?id=${invite.id}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(invite.id);
    setTimeout(() => setCopiedLink(null), 2000);
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

  const getStatusBadge = (status: string, expiresAt: Date) => {
    const isExpired = expiresAt < new Date();
    
    if (status === 'accepted') {
      return <Badge className="bg-green-100 text-green-700">Aceito</Badge>;
    }
    if (status === 'revoked') {
      return <Badge variant="destructive">Revogado</Badge>;
    }
    if (isExpired || status === 'expired') {
      return <Badge variant="secondary">Expirado</Badge>;
    }
    return <Badge className="bg-yellow-100 text-yellow-700">Pendente</Badge>;
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: 'Proprietário',
      manager: 'Gerente',
      employee: 'Funcionário',
      viewer: 'Visualizador',
    };
    return labels[role] || role;
  };

  if (!currentFranchise) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <CardTitle>Nenhuma franquia selecionada</CardTitle>
            <CardDescription>
              Selecione uma franquia no menu lateral para gerenciar a equipe
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Equipe</h1>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <p className="text-gray-500">
            Gerencie os membros de {currentFranchise.name}
          </p>
        </div>
        <Button onClick={() => setShowInviteDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Convidar
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="members" className="flex items-center gap-2">
            <UsersRound className="h-4 w-4" />
            Membros
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {members.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="invitations" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Convites
            {pendingCount > 0 && (
              <Badge className="ml-1 h-5 px-1.5 text-xs bg-yellow-500">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar membros..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Members List */}
          <Card>
            <CardContent className="p-0">
              {loadingMembers ? (
                <div className="p-12 text-center">
                  <Loader2 className="h-8 w-8 mx-auto text-gray-400 mb-4 animate-spin" />
                  <p className="text-gray-500">Carregando membros...</p>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="p-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  {searchQuery ? (
                    <>
                      <h3 className="text-lg font-medium text-gray-900 mb-1">
                        Nenhum membro encontrado
                      </h3>
                      <p className="text-gray-500">
                        Tente buscar com outros termos
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-medium text-gray-900 mb-1">
                        Nenhum membro
                      </h3>
                      <p className="text-gray-500 mb-4">
                        Convide membros para sua equipe
                      </p>
                      <Button onClick={() => setShowInviteDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Convidar
                      </Button>
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
                                <Link to={`/team/${member.id}`}>
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
                                    Remover
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
                {filteredMembers.length} de {members.length} membro(s)
              </span>
              <div className="flex items-center gap-4">
                <span>{members.filter(m => m.role === 'owner').length} proprietário(s)</span>
                <span>{members.filter(m => m.role === 'manager').length} gerente(s)</span>
                <span>{members.filter(m => m.role === 'employee').length} funcionário(s)</span>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Invitations Tab */}
        <TabsContent value="invitations" className="space-y-4">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-yellow-100">
                    <Clock className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{pendingCount}</p>
                    <p className="text-sm text-gray-500">Pendentes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-100">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {invitations.filter(i => i.status === 'accepted').length}
                    </p>
                    <p className="text-sm text-gray-500">Aceitos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-gray-100">
                    <XCircle className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {invitations.filter(i => 
                        i.status === 'revoked' || 
                        i.status === 'expired' || 
                        i.expiresAt < new Date()
                      ).length}
                    </p>
                    <p className="text-sm text-gray-500">Expirados/Revogados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Invitations List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lista de Convites</CardTitle>
              <CardDescription>
                Todos os convites enviados para esta franquia
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingInvitations ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : invitations.length === 0 ? (
                <div className="text-center py-12">
                  <Mail className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    Nenhum convite enviado
                  </h3>
                  <p className="text-gray-500 mb-4">
                    Convide membros para sua equipe
                  </p>
                  <Button onClick={() => setShowInviteDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar primeiro convite
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {invitations.map((invite) => (
                    <div 
                      key={invite.id}
                      className="flex items-center justify-between p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-full bg-gray-100">
                          <Mail className="h-5 w-5 text-gray-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{invite.email}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>{getRoleLabel(invite.role)}</span>
                            <span>•</span>
                            <span>{invite.createdAt.toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {getStatusBadge(invite.status, invite.expiresAt)}
                        
                        {invite.status === 'pending' && invite.expiresAt > new Date() && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyInviteLink(invite)}
                              title="Copiar link"
                            >
                              {copiedLink === invite.id ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeInviteMutation.mutate(invite.id)}
                              disabled={revokeInviteMutation.isPending}
                              title="Revogar convite"
                            >
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Remove Member Dialog */}
      <Dialog open={!!removeMember} onOpenChange={() => setRemoveMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover membro</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover "{removeMember?.displayName || removeMember?.email}" da equipe?
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
                'Remover'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar Membro</DialogTitle>
            <DialogDescription>
              Envie um convite para um novo membro da equipe
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={createInviteMutation.isPending}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Função</Label>
              <Select
                value={inviteRole}
                onValueChange={setInviteRole}
                disabled={createInviteMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="employee">Funcionário</SelectItem>
                  <SelectItem value="viewer">Visualizador</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                O convite expira em 7 dias
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInviteDialog(false)}
              disabled={createInviteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateInvite}
              disabled={createInviteMutation.isPending}
            >
              {createInviteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Convite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
