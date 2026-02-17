import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, admin, serverTimestamp } from '../lib';

interface ToggleEventModeInput {
  franchiseId: string;
  storeId: string;
  enabled: boolean;
  label?: string;
  durationMinutes?: number;
  activateDynamicPricing?: boolean;
}

export const toggleEventMode = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as ToggleEventModeInput;
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = request.auth.uid;
    const { franchiseId, storeId, enabled, label = '', durationMinutes = 10, activateDynamicPricing = false } = data || ({} as ToggleEventModeInput);

    if (!franchiseId || !storeId || typeof enabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Parâmetros inválidos');
    }

    try {
      // Verifica se é superadmin
      const callerClaims = request.auth.token || {};
      if (callerClaims.role === 'superadmin') {
        // superadmin segue
      } else {
        // Verifica owner da franquia
        const franchiseDoc = await db.collection('franchises').doc(franchiseId).get();
        if (!franchiseDoc.exists) {
          throw new HttpsError('not-found', 'Franquia não encontrada');
        }

        const fdata = franchiseDoc.data() || {};
        if (fdata.ownerId === uid) {
          // owner ok
        } else {
          // Verifica membership role
          const memberRef = db.collection(`franchises/${franchiseId}/members`).doc(uid);
          const memberSnap = await memberRef.get();
          if (!memberSnap.exists) {
            throw new HttpsError('permission-denied', 'Usuário não tem permissão para alterar modo evento');
          }

          const role = (memberSnap.data() || {}).role;
          if (!['owner', 'admin', 'manager'].includes(role)) {
            throw new HttpsError('permission-denied', 'Role insuficiente para alterar modo evento');
          }
        }
      }

      const endsAt = enabled ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + (durationMinutes || 10) * 60_000)) : null;
      const esRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/eventStats/current`);

      await esRef.set({
        eventMode: { enabled, label: label || '', endsAt, activateDynamicPricing: enabled ? activateDynamicPricing : false },
        updatedAt: serverTimestamp(),
      }, { merge: true });

      return { success: true };
    } catch (err: any) {
      console.error('[toggleEventMode] error:', err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err?.message || 'Erro interno');
    }
  });
