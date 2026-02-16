/**
 * ============================================================================
 * Ranking Cloud Functions — Agregação server-side para TV Dashboard
 * ============================================================================
 *
 * 1. onOrderUpdatedRanking: Atualiza ranking quando customerName é adicionado
 * 2. recalculateRanking30min: Scheduled (cada 3 min) recalcula janela 30 min
 * 3. checkChallengeCompletion: Verifica desafios após order
 * 4. goldenServe: Premiação 1-em-N determinística
 * 5. expirePrizes: Scheduled para expirar prêmios não resgatados
 * 6. expireEventMode: Scheduled para desativar modo evento expirado
 *
 * @author Open Kiosk Project
 */

import * as functions from 'firebase-functions';
import { db, admin, increment, serverTimestamp } from '../lib';
import {
  maskName,
  getCustomerId,
  calcTotalMl,
  calcFavoriteDrink,
  todayYMD,
  generatePrizeCode,
} from './helpers';
import type { OrderData, RankingAggDoc, ChallengeDoc } from './helpers';

const REGION = 'southamerica-east1';

// ============================================================================
// 1. onOrderUpdatedRanking
// ============================================================================

/**
 * Quando um order é atualizado com customerName (via enrichOrderWithCustomerData),
 * incrementa os docs de ranking agregado e eventStats.
 */
export const onOrderUpdatedRanking = functions
  .region(REGION)
  .firestore
  .document('franchises/{franchiseId}/stores/{storeId}/orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as OrderData;
    const after = change.after.data() as OrderData;
    const { franchiseId, storeId } = context.params;

    // Só agrega quando customerName aparece (vindo de enrichOrder)
    const nameAppeared = !before.customerName && !!after.customerName;
    // Ou quando status muda para completed/dispensing com nome já presente
    const statusChanged =
      after.customerName &&
      before.status !== after.status &&
      ['completed', 'paid_pending_dispense', 'dispensing'].includes(after.status);

    if (!nameAppeared && !statusChanged) return;
    // Evitar dupla contagem: só processa se nameAppeared OU se foi apenas mudança de status
    if (!nameAppeared && statusChanged && before.customerName) {
      // Status changed mas nome já existia — não recontar
      return;
    }

    const customerId = getCustomerId(after);
    const totalMl = calcTotalMl(after.items);
    const date = after.date || todayYMD();

    console.log(`[ranking] Aggregating for ${customerId}: +${totalMl}mL, store=${storeId}`);

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;
    const rankingRef = db.doc(`${storePath}/rankingAgg/${customerId}`);
    const eventStatsRef = db.doc(`${storePath}/eventStats/current`);

    try {
      // Use transaction for atomic read-then-write (prevents race conditions
      // when concurrent triggers fire for the same customer)
      await db.runTransaction(async (tx) => {
        const existingDoc = await tx.get(rankingRef);
        const statsDoc = await tx.get(eventStatsRef);
        const isNewCustomer = !existingDoc.exists;

        // Upsert ranking doc
        if (existingDoc.exists) {
          tx.update(rankingRef, {
            totalMl: increment(totalMl),
            totalSpent: increment(after.total || 0),
            orderCount: increment(1),
            lastOrderAt: after.timestamp || serverTimestamp(),
            favoriteDrink: calcFavoriteDrink(after.items),
            date,
          });
        } else {
          const newDoc: RankingAggDoc = {
            customerId,
            displayName: maskName(after.customerName || 'Anônimo'),
            totalMl,
            totalMl30min: totalMl,
            totalSpent: after.total || 0,
            orderCount: 1,
            favoriteDrink: calcFavoriteDrink(after.items),
            lastOrderAt: (after.timestamp as admin.firestore.Timestamp) || admin.firestore.Timestamp.now(),
            date,
          };
          tx.set(rankingRef, newDoc);
        }

        // Upsert eventStats (with correct uniqueCustomers tracking)
        if (statsDoc.exists) {
          const currentData = statsDoc.data();
          // Reset if it's a new day
          if (currentData?.date !== date) {
            tx.set(eventStatsRef, {
              totalMl,
              totalServes: 1,
              uniqueCustomers: 1,
              date,
              goalEnabled: currentData?.goalEnabled || false,
              goalTargetMl: currentData?.goalTargetMl || 100000,
              goalLabel: currentData?.goalLabel || 'Meta do Dia',
              milestones: currentData?.milestones || [],
              eventMode: { enabled: false, label: '', endsAt: null },
              updatedAt: serverTimestamp(),
            }, { merge: false });
          } else {
            // Same day — increment counters, only increment uniqueCustomers for new customers
            const updateData: Record<string, unknown> = {
              totalMl: increment(totalMl),
              totalServes: increment(1),
              updatedAt: serverTimestamp(),
            };
            if (isNewCustomer) {
              updateData.uniqueCustomers = increment(1);
            }
            tx.update(eventStatsRef, updateData);
          }
        } else {
          tx.set(eventStatsRef, {
            totalMl,
            totalServes: 1,
            uniqueCustomers: 1,
            date,
            goalEnabled: false,
            goalTargetMl: 100000,
            goalLabel: 'Meta do Dia',
            milestones: [],
            eventMode: { enabled: false, label: '', endsAt: null },
            updatedAt: serverTimestamp(),
          });
        }
      });

      // Check milestones (outside transaction — reads fresh data)
      await checkMilestones(franchiseId, storeId);

      console.log(`[ranking] ✅ Aggregated for ${customerId}`);
    } catch (error) {
      console.error(`[ranking] ❌ Error aggregating for ${customerId}:`, error);
    }
  });

// ============================================================================
// 2. recalculateRanking30min (Scheduled)
// ============================================================================

/**
 * A cada 3 minutos, recalcula totalMl30min para todos os clientes.
 * Query: orders dos últimos 30 min com customerName.
 */
export const recalculateRanking30min = functions
  .region(REGION)
  .pubsub
  .schedule('every 3 minutes')
  .onRun(async () => {
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const thirtyMinTimestamp = admin.firestore.Timestamp.fromDate(thirtyMinAgo);
    const today = todayYMD();

    console.log('[ranking30m] Recalculating 30-min window...');

    // Single collectionGroup query to get all active stores (avoids N+1 franchise iteration)
    const storesSnap = await db
      .collectionGroup('stores')
      .where('isActive', '==', true)
      .get();

    for (const storeDoc of storesSnap.docs) {
      try {
        // Extract franchiseId and storeId from the doc path:
        // franchises/{fid}/stores/{sid}
        const pathParts = storeDoc.ref.path.split('/');
        const franchiseId = pathParts[1];
        const storeId = pathParts[3];

        await recalculate30minForStore(
          franchiseId,
          storeId,
          thirtyMinTimestamp,
          today
        );
      } catch (err) {
        console.error(`[ranking30m] Error for store ${storeDoc.id}:`, err);
      }
    }

    console.log('[ranking30m] ✅ Done');
  });

async function recalculate30minForStore(
  franchiseId: string,
  storeId: string,
  since: admin.firestore.Timestamp,
  today: string
): Promise<void> {
  const storePath = `franchises/${franchiseId}/stores/${storeId}`;

  // Buscar orders dos últimos 30 min
  const ordersSnap = await db
    .collection(`${storePath}/orders`)
    .where('timestamp', '>=', since)
    .where('date', '==', today)
    .get();

  // Agrupar por cliente
  const ml30m = new Map<string, number>();
  for (const doc of ordersSnap.docs) {
    const order = doc.data() as OrderData;
    if (!order.customerName) continue;
    const id = getCustomerId(order);
    const ml = calcTotalMl(order.items);
    ml30m.set(id, (ml30m.get(id) || 0) + ml);
  }

  // Pegar ranking atual
  const rankingSnap = await db
    .collection(`${storePath}/rankingAgg`)
    .where('date', '==', today)
    .get();

  // Batch update
  const batch = db.batch();
  let changed = 0;

  for (const rankDoc of rankingSnap.docs) {
    const data = rankDoc.data() as RankingAggDoc;
    const new30m = ml30m.get(data.customerId) || 0;

    if (data.totalMl30min !== new30m) {
      batch.update(rankDoc.ref, { totalMl30min: new30m });
      changed++;
    }
  }

  if (changed > 0) {
    await batch.commit();
    console.log(`[ranking30m] Updated ${changed} ranking docs for ${storeId}`);
  }
}

// ============================================================================
// 3. checkChallengeCompletion
// ============================================================================

/**
 * Verifica se o pedido do cliente completa algum desafio ativo.
 * Chamado internamente após ranking update.
 */
export const onOrderUpdatedChallenge = functions
  .region(REGION)
  .firestore
  .document('franchises/{franchiseId}/stores/{storeId}/orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as OrderData;
    const after = change.after.data() as OrderData;
    const { franchiseId, storeId } = context.params;

    // Só processa quando customerName aparece
    if (!(!before.customerName && after.customerName)) return;
    if (!after.customerName) return;

    const customerId = getCustomerId(after);
    const storePath = `franchises/${franchiseId}/stores/${storeId}`;

    // Buscar desafios ativos
    const challengesSnap = await db
      .collection(`${storePath}/challenges`)
      .where('status', '==', 'active')
      .get();

    if (challengesSnap.empty) return;

    for (const challengeDoc of challengesSnap.docs) {
      const challenge = challengeDoc.data() as ChallengeDoc;
      const windowMs = challenge.rule.windowMinutes * 60 * 1000;
      const windowStart = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - windowMs)
      );

      try {
        let completed = false;

        switch (challenge.rule.type) {
          case 'min_orders': {
            // Contar orders do cliente na janela
            const snap = await db
              .collection(`${storePath}/orders`)
              .where('customerName', '!=', null)
              .where('timestamp', '>=', windowStart)
              .get();
            const count = snap.docs.filter((d) => {
              const o = d.data() as OrderData;
              return getCustomerId(o) === customerId;
            }).length;
            completed = count >= challenge.rule.threshold;
            break;
          }
          case 'min_taps': {
            // Contar productIds distintos do cliente na janela
            const snap = await db
              .collection(`${storePath}/orders`)
              .where('timestamp', '>=', windowStart)
              .get();
            const productIds = new Set<string>();
            for (const d of snap.docs) {
              const o = d.data() as OrderData;
              if (getCustomerId(o) !== customerId) continue;
              for (const item of o.items || []) {
                if (item.mlPerUnit && item.mlPerUnit > 0) {
                  productIds.add(item.productId);
                }
              }
            }
            completed = productIds.size >= challenge.rule.threshold;
            break;
          }
          case 'return_after': {
            // Verificar se há gap de threshold minutos entre orders
            const snap = await db
              .collection(`${storePath}/orders`)
              .where('date', '==', after.date || todayYMD())
              .orderBy('timestamp', 'asc')
              .get();
            const customerOrders = snap.docs
              .map((d) => d.data() as OrderData)
              .filter((o) => o.customerName && getCustomerId(o) === customerId);

            if (customerOrders.length >= 2) {
              const lastTs = customerOrders[customerOrders.length - 1].timestamp?.toMillis() || 0;
              const prevTs = customerOrders[customerOrders.length - 2].timestamp?.toMillis() || 0;
              const gapMinutes = (lastTs - prevTs) / 60000;
              completed = gapMinutes >= challenge.rule.threshold;
            }
            break;
          }
          case 'happy_boost': {
            // Qualquer pedido na janela do happy boost
            completed = true;
            break;
          }
        }

        if (completed) {
          await challengeDoc.ref.update({
            completedCount: increment(1),
          });
          console.log(`[challenge] ${customerId} completed "${challenge.title}"`);

          // Gerar prêmio para o cliente
          await generatePrize(
            franchiseId,
            storeId,
            customerId,
            maskName(after.customerName),
            challenge.rewardType as any,
            challenge.rewardDescription,
            context.params.orderId
          );
        }
      } catch (err) {
        console.error(`[challenge] Error checking ${challenge.title}:`, err);
      }
    }
  });

// ============================================================================
// 4. goldenServe (Bilhete Premiado)
// ============================================================================

/**
 * Verifica se o serve é um "serve dourado" (1 em N determinístico).
 * Usa hash do orderId para determinismo e auditabilidade.
 */
export const onOrderUpdatedGoldenServe = functions
  .region(REGION)
  .firestore
  .document('franchises/{franchiseId}/stores/{storeId}/orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as OrderData;
    const after = change.after.data() as OrderData;
    const { franchiseId, storeId, orderId } = context.params;

    // Só processa quando customerName aparece (primeiro enrich)
    if (!(!before.customerName && after.customerName)) return;
    if (!after.customerName) return;

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;

    // Ler config do golden serve
    const tvConfigDoc = await db.doc(`${storePath}/tvConfig/current`).get();
    const tvConfig = tvConfigDoc.data();
    const goldenConfig = tvConfig?.goldenServe;

    if (!goldenConfig?.enabled || !goldenConfig?.frequency) return;

    // Hash determinístico: simples mas auditável
    let hash = 0;
    for (let i = 0; i < orderId.length; i++) {
      const char = orderId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const isGolden = Math.abs(hash) % goldenConfig.frequency === 0;

    if (!isGolden) return;

    console.log(`[goldenServe] 🎉 Order ${orderId} is a golden serve!`);

    // Determinar tipo de prêmio (weighted random)
    const weights = goldenConfig.prizeWeights || { coupon: 60, free_drink: 30, pix: 8, custom: 2 };
    const totalWeight = Object.values(weights).reduce((a: number, b: unknown) => a + (b as number), 0);
    let rand = Math.random() * totalWeight;
    let prizeType = 'coupon';
    for (const [type, weight] of Object.entries(weights)) {
      rand -= weight as number;
      if (rand <= 0) {
        prizeType = type;
        break;
      }
    }

    // Verificar limite de Pix por pessoa
    if (prizeType === 'pix') {
      const customerId = getCustomerId(after);
      const maxPix = goldenConfig.maxPixPerPerson || 1;
      const pixPrizes = await db
        .collection(`${storePath}/prizes`)
        .where('winnerId', '==', customerId)
        .where('type', '==', 'pix')
        .where('status', 'in', ['won', 'redeemed'])
        .get();

      if (pixPrizes.size >= maxPix) {
        prizeType = 'coupon'; // Fallback
        console.log(`[goldenServe] Pix limit reached for ${customerId}, falling back to coupon`);
      }
    }

    const descriptions = goldenConfig.prizeDescriptions || {
      coupon: 'Cupom de desconto',
      free_drink: 'Chope grátis',
      pix: 'Pix premiado',
      custom: 'Prêmio especial',
    };

    await generatePrize(
      franchiseId,
      storeId,
      getCustomerId(after),
      maskName(after.customerName),
      prizeType,
      descriptions[prizeType] || 'Prêmio',
      orderId
    );
  });

// ============================================================================
// HELPER: Gerar prêmio
// ============================================================================

async function generatePrize(
  franchiseId: string,
  storeId: string,
  customerId: string,
  displayName: string,
  type: string,
  description: string,
  orderId: string
): Promise<void> {
  const storePath = `franchises/${franchiseId}/stores/${storeId}`;
  const code = generatePrizeCode();
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(now.toDate().getTime() + 30 * 60 * 1000) // 30 min
  );

  const prize = {
    type,
    description,
    code,
    status: 'won',
    winnerId: customerId,
    winnerDisplayName: displayName,
    orderId,
    wonAt: now,
    expiresAt,
    createdAt: now,
  };

  await db.collection(`${storePath}/prizes`).add(prize);
  console.log(`[prize] Created ${type} prize for ${displayName}: ${code}`);
}

// ============================================================================
// 5. expirePrizes (Scheduled)
// ============================================================================

/**
 * A cada 5 minutos, expira prêmios não resgatados (30 min após wonAt).
 * Usa collectionGroup para evitar N+1 queries (franchise → store iteration).
 */
export const expirePrizes = functions
  .region(REGION)
  .pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    console.log('[prizes] Checking for expired prizes...');

    try {
      const expiredSnap = await db
        .collectionGroup('prizes')
        .where('status', '==', 'won')
        .where('expiresAt', '<=', now)
        .get();

      if (expiredSnap.empty) {
        console.log('[prizes] No expired prizes found');
        return;
      }

      // Firestore batch limit is 500, chunk if needed
      const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
      for (let i = 0; i < expiredSnap.docs.length; i += 500) {
        chunks.push(expiredSnap.docs.slice(i, i + 500));
      }

      for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach((doc) => batch.update(doc.ref, { status: 'expired' }));
        await batch.commit();
      }

      console.log(`[prizes] Expired ${expiredSnap.size} prizes total`);
    } catch (err) {
      console.error('[prizes] Error expiring prizes:', err);
    }
  });

// ============================================================================
// 6. expireEventMode (Scheduled)
// ============================================================================

/**
 * A cada 1 minuto, desativa Modo Evento se expirado.
 * Usa collectionGroup para evitar N+1 queries.
 */
export const expireEventMode = functions
  .region(REGION)
  .pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    try {
      const activeEventsSnap = await db
        .collectionGroup('eventStats')
        .where('eventMode.enabled', '==', true)
        .get();

      let expired = 0;
      for (const doc of activeEventsSnap.docs) {
        const data = doc.data();
        if (
          data?.eventMode?.endsAt &&
          data.eventMode.endsAt.toMillis() <= now.toMillis()
        ) {
          await doc.ref.update({
            'eventMode.enabled': false,
            'eventMode.label': '',
            'eventMode.endsAt': null,
            updatedAt: serverTimestamp(),
          });
          expired++;
          console.log(`[eventMode] Expired for doc ${doc.ref.path}`);
        }
      }

      if (expired > 0) {
        console.log(`[eventMode] Expired ${expired} event(s)`);
      }
    } catch (err) {
      console.error('[eventMode] Error expiring event modes:', err);
    }
  });

// ============================================================================
// HELPER: checkMilestones
// ============================================================================

async function checkMilestones(
  franchiseId: string,
  storeId: string
): Promise<void> {
  const storePath = `franchises/${franchiseId}/stores/${storeId}`;
  const statsRef = db.doc(`${storePath}/eventStats/current`);

  // Use transaction to read + write milestones + eventMode atomically
  await db.runTransaction(async (tx) => {
    const statsDoc = await tx.get(statsRef);
    if (!statsDoc.exists) return;

    const data = statsDoc.data();
    if (!data?.goalEnabled || !data?.milestones) return;

    const totalMl = data.totalMl || 0;
    const milestones = data.milestones as Array<{
      targetMl: number;
      label: string;
      reached: boolean;
    }>;

    let milestonesUpdated = false;
    let activateEventMode = false;
    let eventLabel = '';
    let eventMinutes = 10;

    for (const milestone of milestones) {
      if (!milestone.reached && totalMl >= milestone.targetMl) {
        milestone.reached = true;
        milestonesUpdated = true;

        // Se o milestone ativa modo evento (label contém "Modo Evento")
        if (milestone.label.toLowerCase().includes('modo evento')) {
          const match = milestone.label.match(/(\d+)\s*min/i);
          eventMinutes = match ? parseInt(match[1], 10) : 10;
          activateEventMode = true;
          eventLabel = milestone.label;
        }
      }
    }

    if (!milestonesUpdated) return;

    // Build a single atomic update with all changes
    const updatePayload: Record<string, unknown> = {
      milestones,
      updatedAt: serverTimestamp(),
    };

    if (activateEventMode) {
      const endsAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + eventMinutes * 60 * 1000)
      );
      updatePayload['eventMode.enabled'] = true;
      updatePayload['eventMode.label'] = eventLabel;
      updatePayload['eventMode.endsAt'] = endsAt;
      console.log(`[milestone] 🔥 Event mode activated: ${eventLabel}`);
    }

    tx.update(statsRef, updatePayload);
  });
}
