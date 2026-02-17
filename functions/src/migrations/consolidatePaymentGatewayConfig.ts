import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, admin, requireAuth } from '../lib';
import { normalizePaymentGatewayConfig } from '../payments/storeConfig';

interface ConsolidatePaymentGatewayConfigInput {
  dryRun?: boolean;
  commit?: boolean;
  removeLegacy?: boolean;
  franchiseId?: string;
  storeId?: string;
}

interface RollbackPaymentGatewayConfigInput {
  runId: string;
}

const hasProp = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

const stripUndefined = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }
  if (value && typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    Object.entries(value).forEach(([key, val]) => {
      if (val !== undefined) {
        cleaned[key] = stripUndefined(val);
      }
    });
    return cleaned;
  }
  return value;
};

export const consolidatePaymentGatewayConfig = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as ConsolidatePaymentGatewayConfigInput;
    requireAuth(request);

    const role = request.auth?.token?.role as string | undefined;
    const isSuperAdmin = role === 'superadmin';
    const isOwnerAdmin = role === 'owner' || role === 'admin';

    if (!isSuperAdmin && !isOwnerAdmin) {
      throw new HttpsError('permission-denied', 'Sem permissao para executar migracao.');
    }

    const dryRun = data.dryRun ?? !data.commit;
    const removeLegacy = data.removeLegacy ?? false;

    const runId = `${Date.now()}`;
    const runRef = db.doc(`migrations/paymentGatewayConfig/${runId}`);
    const runMeta = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      dryRun,
      removeLegacy,
      franchiseId: data.franchiseId || null,
      storeId: data.storeId || null,
      executedBy: request.auth?.uid || null,
    };

    const targets: Array<{ franchiseId: string; storeId: string }> = [];

    if (data.franchiseId && data.storeId) {
      targets.push({ franchiseId: data.franchiseId, storeId: data.storeId });
    } else if (data.franchiseId) {
      const storesSnap = await db.collection(`franchises/${data.franchiseId}/stores`).get();
      storesSnap.forEach((doc) => targets.push({ franchiseId: data.franchiseId!, storeId: doc.id }));
    } else {
      if (!isSuperAdmin) {
        throw new HttpsError('permission-denied', 'Somente superadmin pode migrar todas as franquias.');
      }
      const franchisesSnap = await db.collection('franchises').get();
      for (const franchise of franchisesSnap.docs) {
        const storesSnap = await db.collection(`franchises/${franchise.id}/stores`).get();
        storesSnap.forEach((doc) => targets.push({ franchiseId: franchise.id, storeId: doc.id }));
      }
    }

    let updatedCount = 0;
    const affected: Array<{ franchiseId: string; storeId: string }> = [];

    for (const target of targets) {
      const storeRef = db.doc(`franchises/${target.franchiseId}/stores/${target.storeId}`);
      const storeSnap = await storeRef.get();
      if (!storeSnap.exists) continue;

      const storeData = storeSnap.data() as Record<string, unknown>;
      const normalized = normalizePaymentGatewayConfig(storeData);
      if (!normalized) continue;

      const existingConfig = (storeData.paymentGatewayConfig || {}) as Record<string, unknown>;
      const mergedConfig = stripUndefined({
        ...existingConfig,
        ...normalized,
        enabledMethods: normalized.enabledMethods,
        providers: {
          ...(existingConfig as any).providers,
          ...(normalized.providers || {}),
        },
      });

      const before: Record<string, unknown> = {};
      if (hasProp(storeData, 'paymentGatewayConfig')) before.paymentGatewayConfig = storeData.paymentGatewayConfig;
      if (hasProp(storeData, 'acceptCash')) before.acceptCash = storeData.acceptCash;
      if (hasProp(storeData, 'acceptPix')) before.acceptPix = storeData.acceptPix;
      if (hasProp(storeData, 'acceptCard')) before.acceptCard = storeData.acceptCard;
      if (hasProp(storeData, 'pixKey')) before.pixKey = storeData.pixKey;
      if (hasProp(storeData, 'paymentGateway')) before.paymentGateway = storeData.paymentGateway;

      const updates: Record<string, unknown> = {
        paymentGatewayConfig: mergedConfig,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (removeLegacy) {
        updates.acceptCash = admin.firestore.FieldValue.delete();
        updates.acceptPix = admin.firestore.FieldValue.delete();
        updates.acceptCard = admin.firestore.FieldValue.delete();
        updates.pixKey = admin.firestore.FieldValue.delete();
        updates.paymentGateway = admin.firestore.FieldValue.delete();
      }

      if (!dryRun) {
        await storeRef.set(updates, { merge: true });
        await runRef.collection('stores').doc(target.storeId).set({
          franchiseId: target.franchiseId,
          storeId: target.storeId,
          before,
          after: {
            paymentGatewayConfig: mergedConfig,
            removeLegacy,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      updatedCount += 1;
      affected.push(target);
    }

    if (!dryRun) {
      await runRef.set({
        ...runMeta,
        updatedCount,
      });
    }

    return {
      runId,
      dryRun,
      removeLegacy,
      updatedCount,
      affected,
    };
  });

export const rollbackPaymentGatewayConfig = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as RollbackPaymentGatewayConfigInput;
    requireAuth(request);

    const role = request.auth?.token?.role as string | undefined;
    if (role !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Somente superadmin pode fazer rollback.');
    }

    if (!data.runId) {
      throw new HttpsError('invalid-argument', 'runId obrigatorio.');
    }

    const runRef = db.doc(`migrations/paymentGatewayConfig/${data.runId}`);
    const storesSnap = await runRef.collection('stores').get();
    if (storesSnap.empty) {
      throw new HttpsError('not-found', 'Nenhum registro de migracao encontrado.');
    }

    let rolledBack = 0;

    for (const doc of storesSnap.docs) {
      const payload = doc.data() as { franchiseId: string; storeId: string; before: Record<string, unknown> };
      const storeRef = db.doc(`franchises/${payload.franchiseId}/stores/${payload.storeId}`);

      const before = payload.before || {};
      const updates: Record<string, unknown> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (hasProp(before, 'paymentGatewayConfig')) {
        updates.paymentGatewayConfig = (before as any).paymentGatewayConfig;
      } else {
        updates.paymentGatewayConfig = admin.firestore.FieldValue.delete();
      }
      if (hasProp(before, 'acceptCash')) {
        updates.acceptCash = (before as any).acceptCash;
      } else {
        updates.acceptCash = admin.firestore.FieldValue.delete();
      }
      if (hasProp(before, 'acceptPix')) {
        updates.acceptPix = (before as any).acceptPix;
      } else {
        updates.acceptPix = admin.firestore.FieldValue.delete();
      }
      if (hasProp(before, 'acceptCard')) {
        updates.acceptCard = (before as any).acceptCard;
      } else {
        updates.acceptCard = admin.firestore.FieldValue.delete();
      }
      if (hasProp(before, 'pixKey')) {
        updates.pixKey = (before as any).pixKey;
      } else {
        updates.pixKey = admin.firestore.FieldValue.delete();
      }
      if (hasProp(before, 'paymentGateway')) {
        updates.paymentGateway = (before as any).paymentGateway;
      } else {
        updates.paymentGateway = admin.firestore.FieldValue.delete();
      }

      await storeRef.set(updates, { merge: true });
      rolledBack += 1;
    }

    await runRef.set(
      {
        rolledBackAt: admin.firestore.FieldValue.serverTimestamp(),
        rolledBackCount: rolledBack,
      },
      { merge: true }
    );

    return { runId: data.runId, rolledBack };
  });
