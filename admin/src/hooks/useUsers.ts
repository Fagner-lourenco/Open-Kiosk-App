/**
 * ============================================================================
 * useUsers Hook
 * ============================================================================
 * 
 * Hook para gerenciamento de usuários/membros da franquia.
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getFranchiseMembers,
  getInvitations as getInvitationsService,
  createInvitation as createInvitationService,
  updateMemberRole,
  removeMember as removeMemberService,
  revokeInvitation as revokeInvitationService,
  resendInvitation as resendInvitationService,
  FranchiseMember,
  Invitation,
} from '@/services/userService';
import { useFranchise } from '@/context/FranchiseContext';
import { useToast } from './useToast';
import { UserRole } from '@/types/franchise';

interface UseUsersReturn {
  /** Lista de membros */
  members: FranchiseMember[];
  /** Lista de convites */
  invitations: Invitation[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Convidar usuário */
  inviteUser: (email: string, role: UserRole) => Promise<string>;
  /** Alterar função do usuário */
  changeRole: (memberId: string, newRole: UserRole) => Promise<void>;
  /** Remover membro */
  removeMember: (memberId: string) => Promise<void>;
  /** Revogar convite */
  revokeInvitation: (invitationId: string) => Promise<void>;
  /** Reenviar convite */
  resendInvitation: (invitationId: string) => Promise<void>;
  /** Recarregar dados */
  refetch: () => void;
  /** Estados de loading */
  isInviting: boolean;
  isChangingRole: boolean;
  isRemoving: boolean;
}

export function useUsers(): UseUsersReturn {
  const { currentFranchise } = useFranchise();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  
  const [isInviting, setIsInviting] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  
  // Query para membros
  const { 
    data: members = [], 
    isLoading: isLoadingMembers,
    error: membersError,
    refetch: refetchMembers
  } = useQuery({
    queryKey: ['members', currentFranchise?.id],
    queryFn: () => {
      if (!currentFranchise?.id) return [];
      return getFranchiseMembers(currentFranchise.id);
    },
    enabled: !!currentFranchise?.id,
  });
  
  // Query para convites
  const { 
    data: invitations = [], 
    isLoading: isLoadingInvitations,
    refetch: refetchInvitations
  } = useQuery({
    queryKey: ['invitations', currentFranchise?.id],
    queryFn: () => {
      if (!currentFranchise?.id) return [];
      return getInvitationsService(currentFranchise.id);
    },
    enabled: !!currentFranchise?.id,
  });
  
  // Refetch combinado
  const refetch = useCallback(() => {
    refetchMembers();
    refetchInvitations();
  }, [refetchMembers, refetchInvitations]);
  
  // Convidar usuário
  const inviteUser = useCallback(async (
    email: string, 
    role: UserRole
  ): Promise<string> => {
    if (!currentFranchise?.id) {
      throw new Error('Nenhuma franquia selecionada');
    }
    
    setIsInviting(true);
    try {
      const inviteId = await createInvitationService({
        franchiseId: currentFranchise.id,
        franchiseName: currentFranchise.name,
        email,
        role,
        invitedBy: currentFranchise.ownerId || '',
      });
      
      queryClient.invalidateQueries({ queryKey: ['invitations', currentFranchise.id] });
      
      success(`Convite enviado para ${email}`);
      
      return inviteId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar convite';
      toastError(message);
      throw err;
    } finally {
      setIsInviting(false);
    }
  }, [currentFranchise, queryClient, success, toastError]);
  
  // Alterar função
  const changeRole = useCallback(async (memberId: string, newRole: UserRole): Promise<void> => {
    if (!currentFranchise?.id) {
      throw new Error('Nenhuma franquia selecionada');
    }
    
    setIsChangingRole(true);
    try {
      await updateMemberRole(currentFranchise.id, memberId, newRole);
      
      queryClient.invalidateQueries({ queryKey: ['members', currentFranchise.id] });
      
      success('Função do usuário atualizada');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao alterar função';
      toastError(message);
      throw err;
    } finally {
      setIsChangingRole(false);
    }
  }, [currentFranchise, queryClient, success, toastError]);
  
  // Remover membro
  const removeMember = useCallback(async (memberId: string): Promise<void> => {
    if (!currentFranchise?.id) {
      throw new Error('Nenhuma franquia selecionada');
    }
    
    setIsRemoving(true);
    try {
      await removeMemberService(currentFranchise.id, memberId);
      
      queryClient.invalidateQueries({ queryKey: ['members', currentFranchise.id] });
      
      success('Usuário removido da franquia');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao remover membro';
      toastError(message);
      throw err;
    } finally {
      setIsRemoving(false);
    }
  }, [currentFranchise, queryClient, success, toastError]);
  
  // Revogar convite
  const revokeInvitation = useCallback(async (invitationId: string): Promise<void> => {
    if (!currentFranchise?.id) {
      throw new Error('Nenhuma franquia selecionada');
    }
    
    try {
      await revokeInvitationService(invitationId);
      
      queryClient.invalidateQueries({ queryKey: ['invitations', currentFranchise.id] });
      
      success('Convite revogado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao revogar convite';
      toastError(message);
      throw err;
    }
  }, [currentFranchise, queryClient, success, toastError]);
  
  // Reenviar convite
  const resendInvitation = useCallback(async (invitationId: string): Promise<void> => {
    if (!currentFranchise?.id) {
      throw new Error('Nenhuma franquia selecionada');
    }
    
    try {
      await resendInvitationService(invitationId);
      
      success('Convite reenviado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao reenviar convite';
      toastError(message);
      throw err;
    }
  }, [currentFranchise, success, toastError]);
  
  return {
    members,
    invitations,
    isLoading: isLoadingMembers || isLoadingInvitations,
    error: membersError as Error | null,
    inviteUser,
    changeRole,
    removeMember,
    revokeInvitation,
    resendInvitation,
    refetch,
    isInviting,
    isChangingRole,
    isRemoving,
  };
}
