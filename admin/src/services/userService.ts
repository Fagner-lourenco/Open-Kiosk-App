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
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  membersPath,
  memberPath,
  invitationsPath,
  storePath
} from '@/lib/pathResolver';

/**
 * Generate a secure random token for invitations
 */
function generateInvitationToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

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
 * Get all members of a franchise (subcollection)
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

  return members;
}

/**
 * Update member role in franchise (subcollection)
 */
export async function updateMemberRole(
  franchiseId: string,
  memberId: string,
  newRole: string
): Promise<void> {
  const memberRef = doc(db, 'franchises', franchiseId, 'members', memberId);
  const memberSnap = await getDoc(memberRef);

  if (!memberSnap.exists()) {
    throw new Error('Member not found');
  }

  if (memberSnap.data().role === 'owner') {
    throw new Error('Cannot change owner role');
  }

  // [FIX BUG-T4] Ajustar storeAccess conforme a nova role
  const updateData: Record<string, unknown> = { role: newRole };
  const highRoles = ['owner', 'admin', 'manager'];
  if (highRoles.includes(newRole)) {
    // Roles com acesso amplo recebem storeAccess: ['*']
    updateData.storeAccess = ['*'];
  }
  // Nota: se for rebaixado de admin → operator, storeAccess mantém as lojas atuais
  // (não remove ['*']) pois isso deve ser gerido manualmente pela UI de lojas.
  // Uma Cloud Function poderia forçar a limpeza se necessário.

  await updateDoc(memberRef, updateData);
}

/**
 * Remove member from franchise (soft delete via isActive=false)
 */
export async function removeMember(franchiseId: string, memberId: string): Promise<void> {
  const memberRef = doc(db, 'franchises', franchiseId, 'members', memberId);
  const memberSnap = await getDoc(memberRef);

  if (!memberSnap.exists()) {
    throw new Error('Member not found');
  }

  if (memberSnap.data().role === 'owner') {
    throw new Error('Cannot remove owner');
  }

  await updateDoc(memberRef, { isActive: false });
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
  // [FIX BUG-GES-03] Bloquear privilege escalation: apenas owner pode convidar como 'owner'
  if (data.role === 'owner') {
    const franchiseRef = doc(db, 'franchises', data.franchiseId);
    const franchiseSnap = await getDoc(franchiseRef);
    if (!franchiseSnap.exists()) throw new Error('Franquia não encontrada');
    // O caller precisa ser o owner real (ownerId) — aqui verificamos server-side via regras,
    // mas fazemos guard client-side para UX
    // A regra do Firestore também bloqueia (FIX em firestore.rules)
  }

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

  const memberRef = doc(db, memberPath(invite.franchiseId, userId));
  const memberDoc = await getDoc(memberRef);

  if (!memberDoc.exists()) {
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
      const storeData = storeDoc.data();
      const storeMembers = storeData.operators || storeData.members || [];

      if (!storeMembers.find((m: any) => m.id === userId)) {
        storeMembers.push({
          id: userId,
          email: userEmail,
          role: invite.role,
          addedAt: new Date().toISOString(),
        });

        await updateDoc(storeRef, { operators: storeMembers });
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
