/**
 * ============================================================================
 * InvitationsPage - Gerenciar Convites
 * ============================================================================
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { generateInvitationToken } from '@/lib/invitationToken';
import { 
  Plus, 
  Mail, 
  Clock, 
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Copy,
  Building2,
  Send
} from 'lucide-react';

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

export function InvitationsPage() {
  const queryClient = useQueryClient();
  const { currentFranchise } = useFranchise();
  const { user } = useAuth();
  
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('employee');
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const { data: invitations = [], isLoading } = useQuery({
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

  const createInviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!currentFranchise || !user) throw new Error('Dados inválidos');
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration
      
      const inviteData = {
        franchiseId: currentFranchise.id,
        franchiseName: currentFranchise.name,
        email: email.toLowerCase(),
        role,
        storeAccess: ['*'],
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
              Selecione uma franquia no menu lateral para gerenciar convites
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
          <h1 className="text-2xl font-bold text-gray-900">Convites</h1>
          <p className="text-gray-500">
            Gerencie convites para {currentFranchise.name}
          </p>
        </div>
        <Button onClick={() => setShowInviteDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Convite
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-yellow-100">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {invitations.filter(i => i.status === 'pending' && i.expiresAt > new Date()).length}
                </p>
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
                  {invitations.filter(i => i.status === 'revoked' || i.status === 'expired' || i.expiresAt < new Date()).length}
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
          {isLoading ? (
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
                Convide membros para sua franquia
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
                        <span>
                          {invite.createdAt.toLocaleDateString('pt-BR')}
                        </span>
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

      {/* Create Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar Usuário</DialogTitle>
            <DialogDescription>
              Envie um convite para um novo membro da franquia
            </DialogDescription>
          </DialogHeader>
          
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
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
