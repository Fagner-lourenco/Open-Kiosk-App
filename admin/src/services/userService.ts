/**
 * ============================================================================
 * User Service - Serviços para gerenciamento de usuários
 * ============================================================================
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  membersPath,
  memberPath,
  franchisePath,
  invitationsPath,
  storePath
} from '@/lib/pathResolver';

export interface FranchiseMember {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: 'owner' | 'admin' | 'manager' | 'operator' | 'employee' | 'technician' | 'viewer';
  addedAt: string;
  lastActive?: Date;
}

export interface Invitation {
  id: string;
  token?: string;
  franchiseId: string;
  franchiseName: string;
  storeId?: string;
  storeName?: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invitedBy: string;
  invitedByName?: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedBy?: string;
  revokedAt?: Date;
}

export interface CreateInvitationData {
  franchiseId: string;
  franchiseName: string;
  storeId?: string;
  storeName?: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedByName?: string;
}

/**
 * Get all members of a franchise (from subcollection + legacy array)
 */
export async function getFranchiseMembers(franchiseId: string): Promise<FranchiseMember[]> {
  const members: FranchiseMember[] = [];

  // 1. Busca da subcollection members (estrutura moderna)
  try {
    const membersRef = collection(db, membersPath(franchiseId));
    const membersSnap = await getDocs(
      query(membersRef, where('isActive', '==', true))
    );

    membersSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      members.push({
        id: docSnap.id,
        orderId: data.orderId,
        userId: data.userId || docSnap.id,
        email: data.email || '',
        displayName: data.displayName || '',
        photoURL: data.photoURL,
        role: data.role || 'viewer',
        storeAccess: data.storeAccess || ['*'],
        permissions: data.permissions || data.customPermissions,
        addedAt: data.addedAt || data.joinedAt?.toDate?.()?.toISOString(),
        lastActive: data.lastActive?.toDate?.(),
      } as FranchiseMember);
    });
  } catch (error) {
    console.warn('[userService] Erro ao buscar subcollection members:', error);
  }

  // 2. Fallback: busca do array legado para compatibilidade
  const franchiseRef = doc(db, franchisePath(franchiseId));
  const franchiseSnap = await getDoc(franchiseRef);

  if (!franchiseSnap.exists()) {
    throw new Error('Franchise not found');
  }

  const legacyMembers = franchiseSnap.data().members || [];

  // Adiciona membros do array que não estão na subcollection
  for (const legacyMember of legacyMembers) {
    if (!members.some(m => m.id === legacyMember.id)) {
      members.push({
        id: legacyMember.id,
        userId: legacyMember.id,
        email: legacyMember.email || '',
        displayName: legacyMember.displayName || '',
        role: legacyMember.role || 'viewer',
        storeAccess: legacyMember.storeAccess || ['*'],
        addedAt: legacyMember.addedAt,
      } as FranchiseMember);
    }
  }

  return members;
}

/**
 * Update member role in franchise (subcollection + legacy array)
 * Usa writeBatch para garantir atomicidade
 */
export async function updateMemberRole(
  franchiseId: string,
  memberId: string,
  newRole: string
): Promise<void> {
  const batch = writeBatch(db);

  // 1. Verifica na subcollection primeiro
  const memberRef = doc(db, 'franchises', franchiseId, 'members', memberId);
  const memberSnap = await getDoc(memberRef);

  // 2. Carrega dados da franquia
  const franchiseRef = doc(db, 'franchises', franchiseId);
  const franchiseSnap = await getDoc(franchiseRef);

  if (!franchiseSnap.exists()) {
    throw new Error('Franchise not found');
  }

  // Verifica se é owner em qualquer lugar
  if (memberSnap.exists() && memberSnap.data().role === 'owner') {
    throw new Error('Cannot change owner role');
  }

  // Atualiza na subcollection se existe
  if (memberSnap.exists()) {
    batch.update(memberRef, { role: newRole });
  }

  // Atualiza no array legado
  const members = franchiseSnap.data().members || [];
  const memberIndex = members.findIndex((m: any) => m.id === memberId);

  if (memberIndex !== -1) {
    if (members[memberIndex].role === 'owner') {
      throw new Error('Cannot change owner role');
    }
    members[memberIndex].role = newRole;
    batch.update(franchiseRef, { members });
  } else if (!memberSnap.exists()) {
    throw new Error('Member not found');
  }

  // Executa ambas operações atomicamente
  await batch.commit();
}

/**
 * Remove member from franchise (soft delete via isActive=false)
 * Usa writeBatch para garantir atomicidade
 */
export async function removeMember(franchiseId: string, memberId: string): Promise<void> {
  const batch = writeBatch(db);

  // 1. Verifica na subcollection primeiro
  const memberRef = doc(db, 'franchises', franchiseId, 'members', memberId);
  const memberSnap = await getDoc(memberRef);

  // 2. Carrega dados da franquia
  const franchiseRef = doc(db, 'franchises', franchiseId);
  const franchiseSnap = await getDoc(franchiseRef);

  if (!franchiseSnap.exists()) {
    throw new Error('Franchise not found');
  }

  // Verifica se é owner
  if (memberSnap.exists() && memberSnap.data().role === 'owner') {
    throw new Error('Cannot remove owner');
  }

  // Soft delete na subcollection
  if (memberSnap.exists()) {
    batch.update(memberRef, { isActive: false });
  }

  // Remove do array legado
  const members = franchiseSnap.data().members || [];
  const member = members.find((m: any) => m.id === memberId);

  if (member) {
    if (member.role === 'owner') {
      throw new Error('Cannot remove owner');
    }
    const updatedMembers = members.filter((m: any) => m.id !== memberId);
    batch.update(franchiseRef, { members: updatedMembers });
  } else if (!memberSnap.exists()) {
    throw new Error('Member not found');
  }

  // Executa ambas operações atomicamente
  await batch.commit();
}

/**
 * Get all invitations for a franchise
 */
export async function getInvitations(franchiseId: string): Promise<Invitation[]> {
  const snapshot = await getDocs(
    query(
      collection(db, invitationsPath()),
      where('franchiseId', '==', franchiseId),
      orderBy('createdAt', 'desc')
    )
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    token: doc.data().token,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    expiresAt: doc.data().expiresAt?.toDate() || new Date(),
    acceptedAt: doc.data().acceptedAt?.toDate(),
    revokedAt: doc.data().revokedAt?.toDate(),
  })) as Invitation[];
}

/**
 * Create a new invitation
 */
export async function createInvitation(data: CreateInvitationData): Promise<string> {
  // Check if pending invitation already exists for this email
  const existingInvites = await getDocs(
    query(
      collection(db, invitationsPath()),
      where('franchiseId', '==', data.franchiseId),
      where('email', '==', data.email.toLowerCase()),
      where('status', '==', 'pending')
    )
  );

  if (!existingInvites.empty) {
    throw new Error('Já existe um convite pendente para este email');
  }

  // Calculate expiration (7 days)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invitationData = {
    ...data,
    email: data.email.toLowerCase(),
    storeAccess: data.storeId ? [data.storeId] : ['*'],
    status: 'pending',
    token: generateInvitationToken(),
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
  };

  const docRef = await addDoc(collection(db, invitationsPath()), invitationData);
  return docRef.id;
}

/**
 * Revoke an invitation
 */
export async function revokeInvitation(invitationId: string): Promise<void> {
  await updateDoc(doc(db, invitationsPath(), invitationId), {
    status: 'revoked',
    revokedAt: serverTimestamp(),
  });
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(
  invitationId: string,
  userId: string,
  userEmail: string,
  userDisplayName?: string
): Promise<void> {
  const inviteDoc = await getDoc(doc(db, invitationsPath(), invitationId));

  if (!inviteDoc.exists()) {
    throw new Error('Invitation not found');
  }

  const invite = inviteDoc.data();

  if (invite.status !== 'pending') {
    throw new Error('Invitation is no longer valid');
  }

  const expiresAt = invite.expiresAt?.toDate();
  if (expiresAt && expiresAt < new Date()) {
    throw new Error('Invitation has expired');
  }

  // Update invitation status
  await updateDoc(doc(db, invitationsPath(), invitationId), {
    status: 'accepted',
    acceptedAt: serverTimestamp(),
    acceptedBy: userId,
  });

  // Add user to franchise members
  const franchiseRef = doc(db, 'franchises', invite.franchiseId);
  const franchiseDoc = await getDoc(franchiseRef);

  if (!franchiseDoc.exists()) {
    throw new Error('Franchise not found');
  }

  const members = franchiseDoc.data().members || [];

  // Check if user is already a member
  if (!members.find((m: any) => m.id === userId)) {
    const addedAt = new Date().toISOString();

    // 1. Mantém compatibilidade: adiciona ao array no documento
    members.push({
      id: userId,
      email: userEmail,
      displayName: userDisplayName,
      role: invite.role,
      addedAt,
    });
    await updateDoc(franchiseRef, { members });

    // 2. Nova estrutura: cria documento na subcollection members
    const memberRef = doc(db, memberPath(invite.franchiseId, userId));
    await setDoc(memberRef, {
      userId,
      email: userEmail,
      displayName: userDisplayName || null,
      role: invite.role,
      storeAccess: invite.storeId ? [invite.storeId] : ['*'],
      invitedBy: invite.invitedBy,
      invitedAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
      isActive: true,
    });
  }

  // If store-specific invitation, add to store as well
  if (invite.storeId) {
    const storeRef = doc(db, storePath(invite.franchiseId, invite.storeId));
    const storeDoc = await getDoc(storeRef);

    if (storeDoc.exists()) {
      const storeMembers = storeDoc.data().members || [];

      if (!storeMembers.find((m: any) => m.id === userId)) {
        storeMembers.push({
          id: userId,
          email: userEmail,
          role: invite.role,
          addedAt: new Date().toISOString(),
        });

        await updateDoc(storeRef, { members: storeMembers });
      }
    }
  }
}

/**
 * Resend an invitation (creates a new invitation with same details)
 */
export async function resendInvitation(invitationId: string): Promise<string> {
  const inviteDoc = await getDoc(doc(db, invitationsPath(), invitationId));

  if (!inviteDoc.exists()) {
    throw new Error('Invitation not found');
  }

  const invite = inviteDoc.data();

  // Revoke old invitation
  await revokeInvitation(invitationId);

  // Create new invitation
  return createInvitation({
    franchiseId: invite.franchiseId,
    franchiseName: invite.franchiseName,
    storeId: invite.storeId,
    storeName: invite.storeName,
    email: invite.email,
    role: invite.role,
    invitedBy: invite.invitedBy,
    invitedByName: invite.invitedByName,
  });
}
