/**
 * ============================================================================
 * Store Members Tab Component
 * ============================================================================
 * 
 * Componente para gerenciar membros/operadores de uma loja específica.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, getDocs, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Users, Plus, Loader2, Trash2, Shield, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { STORE_ROLE_OPTIONS, getRoleLabel } from '@/config/roles';

interface StoreMember {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: string;
  addedAt: Date;
}

interface FranchiseMember {
  userId: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: string;
}

interface StoreMembersTabProps {
  franchiseId: string;
  storeId: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  manager: 'bg-green-100 text-green-800',
  operator: 'bg-yellow-100 text-yellow-800',
  employee: 'bg-yellow-100 text-yellow-800',
  viewer: 'bg-muted text-foreground',
};

export function StoreMembersTab({ franchiseId, storeId }: StoreMembersTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { log: audit } = useAudit();
  const { user: currentUser } = useAuth();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('operator');
  const [memberToRemove, setMemberToRemove] = useState<StoreMember | null>(null);

  // Fetch store data
  const { data: storeData, isLoading: loadingStore } = useQuery({
    queryKey: ['store', franchiseId, storeId],
    queryFn: async () => {
      const storeRef = doc(db, 'franchises', franchiseId, 'stores', storeId);
      const snapshot = await getDoc(storeRef);
      if (!snapshot.exists()) throw new Error('Loja não encontrada');
      return snapshot.data();
    },
  });

  // Fetch franchise members (to add to store)
  const { data: franchiseMembers = [], isLoading: loadingFranchise } = useQuery({
    queryKey: ['franchise-members', franchiseId],
    queryFn: async (): Promise<FranchiseMember[]> => {
      const membersRef = collection(db, 'franchises', franchiseId, 'members');
      const snapshot = await getDocs(query(membersRef));
      return snapshot.docs.map(doc => ({
        userId: doc.id,
        ...doc.data(),
      })) as FranchiseMember[];
    },
  });

  // Parse store members from store data
  const operatorsRaw = storeData?.operators ?? storeData?.members ?? [];
  const storeMembers: StoreMember[] = operatorsRaw.map((op: { 
    id: string; 
    email: string; 
    displayName?: string; 
    photoURL?: string; 
    role?: string;
    addedAt?: Date;
  }) => ({
    id: op.id,
    email: op.email,
    displayName: op.displayName,
    photoURL: op.photoURL,
    role: op.role || 'operator',
    addedAt: op.addedAt || new Date(),
  })) || [];

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const member = franchiseMembers.find(m => m.userId === userId);
      if (!member) throw new Error('Membro não encontrado');

      const storeRef = doc(db, 'franchises', franchiseId, 'stores', storeId);
      await updateDoc(storeRef, {
        operators: arrayUnion({
          id: userId,
          email: member.email,
          displayName: member.displayName || '',
          photoURL: member.photoURL || '',
          role,
          addedAt: new Date(),
        }),
      });
    },
    onSuccess: (_data, { userId, role }) => {
      queryClient.invalidateQueries({ queryKey: ['store', franchiseId, storeId] });
      toast.success('Membro adicionado com sucesso');
      const member = franchiseMembers.find(m => m.userId === userId);
      audit(AuditActions.STORE_MEMBER_ADD, { type: 'store', id: storeId, name: storeId }, { memberId: userId, memberEmail: member?.email, role });
      setIsAddDialogOpen(false);
      setSelectedUserId('');
      setSelectedRole('operator');
    },
    onError: () => {
      toast.error('Não foi possível adicionar o membro');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (member: StoreMember) => {
      const storeRef = doc(db, 'franchises', franchiseId, 'stores', storeId);
      
      // Need to find and remove the exact operator object
      const operators = storeData?.operators || [];
      const updatedOperators = operators.filter((op: { id: string }) => op.id !== member.id);
      
      await updateDoc(storeRef, {
        operators: updatedOperators,
      });
    },
    onSuccess: (_data, member) => {
      queryClient.invalidateQueries({ queryKey: ['store', franchiseId, storeId] });
      toast.success('Membro removido da loja');
      audit(AuditActions.STORE_MEMBER_REMOVE, { type: 'store', id: storeId, name: storeId }, { memberId: member.id, memberEmail: member.email });
      setMemberToRemove(null);
    },
    onError: () => {
      toast.error('Não foi possível remover o membro');
    },
  });

  // Filter franchise members not yet in store
  const availableMembers = franchiseMembers.filter(
    fm => !storeMembers.some(sm => sm.id === fm.userId)
  );

  const isLoading = loadingStore || loadingFranchise;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Membros da Loja
          </h3>
          <p className="text-sm text-muted-foreground">
            Gerencie quem tem acesso a esta loja
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Membro
        </Button>
      </div>

      {/* Members List */}
      {storeMembers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserPlus className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h4 className="text-lg font-medium text-foreground mb-2">Nenhum membro</h4>
            <p className="text-muted-foreground mb-4">
              Adicione membros da franquia para gerenciar esta loja.
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Membro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {storeMembers.map((member) => (
                <div key={member.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarImage src={member.photoURL} />
                      <AvatarFallback>
                        {member.displayName?.[0]?.toUpperCase() || member.email[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {member.displayName || member.email}
                      </p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={ROLE_COLORS[member.role] || 'bg-muted'}>
                      <Shield className="h-3 w-3 mr-1" />
                      {getRoleLabel(member.role)}
                    </Badge>
                    {member.id !== currentUser?.uid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setMemberToRemove(member)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Member Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Membro à Loja</DialogTitle>
            <DialogDescription>Selecione um membro da franquia para adicionar a esta loja</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {availableMembers.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Todos os membros da franquia já estão nesta loja.
              </p>
            ) : (
              <>
                <div>
                  <Label>Membro</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um membro" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMembers.map((member, index) => (
                        <SelectItem key={member.userId || `member-${index}`} value={member.userId}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={member.photoURL} />
                              <AvatarFallback className="text-xs">
                                {member.email[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span>{member.displayName || member.email}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Função na Loja</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORE_ROLE_OPTIONS.map((roleOption) => (
                        <SelectItem key={roleOption.value} value={roleOption.value}>
                          {roleOption.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => addMemberMutation.mutate({ userId: selectedUserId, role: selectedRole })}
              disabled={!selectedUserId || addMemberMutation.isPending}
            >
              {addMemberMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover "{memberToRemove?.displayName || memberToRemove?.email}" desta loja?
              O usuário perderá acesso a esta loja específica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove)}
            >
              {removeMemberMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
