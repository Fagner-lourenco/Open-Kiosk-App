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

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
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
export const onOrderUpdatedRanking = onDocumentUpdated(
  { document: 'franchises/{franchiseId}/stores/{storeId}/orders/{orderId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const change = { before: event.data.before, after: event.data.after };
    const context = { params: event.params };
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

    // Guard: só agrega pedidos em status elegível
    if (!['completed', 'paid_pending_dispense', 'dispensing'].includes(after.status)) return;

    // Guard: só agrega pedidos com customerName real (evita entradas fantasma)
    if (!after.customerName) return;

    // P1-24: Rejeitar pedidos com paymentStatus fora do esperado
    const invalidPaymentStatuses = ['failed', 'canceled', 'cancelled', 'refunded', 'expired'];
    if (after.paymentStatus && invalidPaymentStatuses.includes(after.paymentStatus)) {
      console.log(`[ranking] Skipping order with invalid paymentStatus: ${after.paymentStatus}`);
      return;
    }

    const customerId = getCustomerId(after);
    const baseMl = calcTotalMl(after.items);
    const date = after.date || todayYMD();

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;

    // 🚀 bonus_multiplier: Verificar se o cliente tem prêmio ativo de multiplicador
    // Se sim, dobra os mL para o ranking (efeito real do "Happy Boost")
    let multiplier = 1;
    try {
      const bonusSnap = await db
        .collection(`${storePath}/prizes`)
        .where('winnerId', '==', customerId)
        .where('type', '==', 'bonus_multiplier')
        .where('status', '==', 'won')
        .get();

      if (!bonusSnap.empty) {
        // Verificar se pelo menos um não expirou
        const now = Date.now();
        const hasActive = bonusSnap.docs.some((d) => {
          const expiresAt = d.data().expiresAt;
          if (!expiresAt) return true;
          const ms = typeof expiresAt.toMillis === 'function' ? expiresAt.toMillis() : (expiresAt.seconds || 0) * 1000;
          return ms > now;
        });
        if (hasActive) {
          multiplier = 2;
          console.log(`[ranking] 🚀 bonus_multiplier ativo para ${customerId} → 2× pontos!`);
        }
      }
    } catch (err) {
      console.warn(`[ranking] Erro ao verificar bonus_multiplier para ${customerId}:`, err);
    }

    const totalMl = baseMl * multiplier;

    console.log(`[ranking] Aggregating for ${customerId}: +${totalMl}mL (base=${baseMl}, ×${multiplier}), store=${storeId}`);

    const rankingRef = db.doc(`${storePath}/rankingAgg/${customerId}`);
    const eventStatsRef = db.doc(`${storePath}/eventStats/current`);

    try {
      // Use transaction for atomic read-then-write (prevents race conditions
      // when concurrent triggers fire for the same customer)
      await db.runTransaction(async (tx) => {
        const existingDoc = await tx.get(rankingRef);
        const statsDoc = await tx.get(eventStatsRef);
        const isNewCustomer = !existingDoc.exists;
        // 🔧 FIX: Detectar troca de dia — doc existe mas é de ontem
        const existingDate = existingDoc.exists ? existingDoc.data()?.date : null;
        const isDayChange = existingDoc.exists && existingDate !== date;
        // Para uniqueCustomers: considerar "novo para hoje" se é novo OU mudou de dia
        const isNewForToday = isNewCustomer || isDayChange;

        // Upsert ranking doc
        if (existingDoc.exists && !isDayChange) {
          // Mesmo dia: incrementar normalmente
          tx.update(rankingRef, {
            totalMl: increment(totalMl),
            totalSpent: increment(after.total || 0),
            orderCount: increment(1),
            lastOrderAt: after.timestamp || serverTimestamp(),
            favoriteDrink: calcFavoriteDrink(after.items),
            date,
          });
        } else if (isDayChange) {
          // 🔧 FIX: Dia mudou — resetar contadores ao invés de acumular
          tx.set(rankingRef, {
            customerId,
            displayName: maskName(after.customerName || 'Anônimo'),
            totalMl,
            totalMl30min: totalMl,
            totalSpent: after.total || 0,
            orderCount: 1,
            favoriteDrink: calcFavoriteDrink(after.items),
            lastOrderAt: (after.timestamp as admin.firestore.Timestamp) || admin.firestore.Timestamp.now(),
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
            // 🔒 FIX #2: Resetar milestones.reached na virada de dia
            const prevMilestones = (currentData?.milestones || []) as Array<{ targetMl: number; label: string; reached: boolean }>;
            const resetMilestones = prevMilestones.map((m) => ({ ...m, reached: false, reachedAt: null }));
            // 🔒 FIX #9: Preservar eventMode se ainda não expirou
            const prevEvent = currentData?.eventMode;
            const eventStillActive = prevEvent?.enabled && prevEvent?.endsAt &&
              (typeof prevEvent.endsAt.toMillis === 'function' ? prevEvent.endsAt.toMillis() : (prevEvent.endsAt.seconds || 0) * 1000) > Date.now();
            tx.set(eventStatsRef, {
              totalMl,
              totalServes: 1,
              uniqueCustomers: 1,
              date,
              goalEnabled: currentData?.goalEnabled || false,
              goalTargetMl: currentData?.goalTargetMl || 100000,
              goalLabel: currentData?.goalLabel || 'Meta do Dia',
              milestones: resetMilestones,
              eventMode: eventStillActive ? prevEvent : { enabled: false, label: '', endsAt: null },
              updatedAt: serverTimestamp(),
            }, { merge: false });
          } else {
            // Same day — increment counters, only increment uniqueCustomers for new customers
            const updateData: Record<string, unknown> = {
              totalMl: increment(totalMl),
              totalServes: increment(1),
              updatedAt: serverTimestamp(),
            };
            if (isNewForToday) {
              // 🔧 FIX: Contar clientes que retornam de dia anterior como novos para hoje
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
 * A cada 10 minutos, recalcula totalMl30min para todos os clientes.
 * Query: orders dos últimos 30 min com customerName.
 * ⚡ COST-OPT: Reduzido de 3→10 min — a CF onOrderUpdatedRanking já faz
 *   incremento real-time; esta CF só recalcula janela deslizante de 30min.
 */
export const recalculateRanking30min = onSchedule(
  { schedule: 'every 10 minutes', region: REGION },
  async () => {
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

  // ⚡ COST-OPT: Early-exit quando não há orders recentes — evita reads desnecessários de ranking/prizes
  if (ordersSnap.empty) {
    // Mesmo sem orders, precisamos zerar totalMl30min de docs antigos
    const rankingSnap = await db
      .collection(`${storePath}/rankingAgg`)
      .where('date', '==', today)
      .where('totalMl30min', '>', 0)
      .get();
    if (!rankingSnap.empty) {
      const batch = db.batch();
      for (const rankDoc of rankingSnap.docs) {
        batch.update(rankDoc.ref, { totalMl30min: 0 });
      }
      await batch.commit();
      console.log(`[ranking30m] Zeroed ${rankingSnap.size} stale 30min docs for ${storeId}`);
    }
    return;
  }

  // Agrupar por cliente
  const ml30m = new Map<string, number>();
  const invalidPaymentStatuses = ['failed', 'canceled', 'cancelled', 'refunded', 'expired'];
  for (const doc of ordersSnap.docs) {
    const order = doc.data() as OrderData;
    if (!order.customerName) continue;
    if (!['completed', 'paid_pending_dispense', 'dispensing'].includes(order.status)) continue;
    if (order.paymentStatus && invalidPaymentStatuses.includes(order.paymentStatus)) continue;
    const id = getCustomerId(order);
    const ml = calcTotalMl(order.items);
    ml30m.set(id, (ml30m.get(id) || 0) + ml);
  }

  // 🚀 FIX #8: Aplicar bonus_multiplier no cálculo de 30min (consistência com ranking diário)
  const bonusCandidates = [...ml30m.keys()];
  if (bonusCandidates.length > 0) {
    const now = Date.now();
    for (const custId of bonusCandidates) {
      try {
        const bonusSnap = await db
          .collection(`${storePath}/prizes`)
          .where('winnerId', '==', custId)
          .where('type', '==', 'bonus_multiplier')
          .where('status', '==', 'won')
          .get();
        if (!bonusSnap.empty) {
          const hasActive = bonusSnap.docs.some((d) => {
            const expiresAt = d.data().expiresAt;
            if (!expiresAt) return true;
            const ms = typeof expiresAt.toMillis === 'function' ? expiresAt.toMillis() : (expiresAt.seconds || 0) * 1000;
            return ms > now;
          });
          if (hasActive) {
            ml30m.set(custId, (ml30m.get(custId) || 0) * 2);
          }
        }
      } catch (err) {
        console.warn(`[ranking30m] Erro ao verificar bonus_multiplier para ${custId}:`, err);
      }
    }
  }

  // Pegar ranking atual
  const rankingSnap = await db
    .collection(`${storePath}/rankingAgg`)
    .where('date', '==', today)
    .get();

  // Batch update — 🔧 FIX: Chunking para respeitar limite de 500 ops por batch
  const BATCH_LIMIT = 499;
  const updates: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];

  for (const rankDoc of rankingSnap.docs) {
    const data = rankDoc.data() as RankingAggDoc;
    const new30m = ml30m.get(data.customerId) || 0;

    if (data.totalMl30min !== new30m) {
      updates.push({ ref: rankDoc.ref, data: { totalMl30min: new30m } });
    }
  }

  if (updates.length > 0) {
    for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      const chunk = updates.slice(i, i + BATCH_LIMIT);
      for (const u of chunk) {
        batch.update(u.ref, u.data);
      }
      await batch.commit();
    }
    console.log(`[ranking30m] Updated ${updates.length} ranking docs for ${storeId}`);
  }
}

// ============================================================================
// 3. checkChallengeCompletion
// ============================================================================

/**
 * Verifica se o pedido do cliente completa algum desafio ativo.
 * Chamado internamente após ranking update.
 */
export const onOrderUpdatedChallenge = onDocumentUpdated(
  { document: 'franchises/{franchiseId}/stores/{storeId}/orders/{orderId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const change = { before: event.data.before, after: event.data.after };
    const context = { params: event.params };
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

      // 🔒 FIX: Verificar endsAt (belt-and-suspenders — não confiar apenas em status)
      if (challenge.endsAt && challenge.endsAt.toMillis() < Date.now()) {
        console.log(`[challenge] "${challenge.title}" expirou (endsAt passed) — skip`);
        continue;
      }

      // 🔒 FIX: Dedup per-client — cada cliente ganha no máximo 1 vez por desafio
      const alreadyCompleted = (challenge.completedCustomers || []).includes(customerId);
      if (alreadyCompleted) {
        console.log(`[challenge] ${customerId} já completou "${challenge.title}" — skip`);
        continue;
      }

      const windowMs = challenge.rule.windowMinutes * 60 * 1000;
      const windowStart = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - windowMs)
      );

      try {
        let completed = false;

        // 🔒 FIX #1: Helper para validar se order é elegível (mesma lógica do ranking)
        const isEligibleOrder = (o: OrderData): boolean => {
          if (!['completed', 'paid_pending_dispense', 'dispensing'].includes(o.status)) return false;
          const badPayment = ['failed', 'canceled', 'cancelled', 'refunded', 'expired'];
          if (o.paymentStatus && badPayment.includes(o.paymentStatus)) return false;
          return true;
        };

        switch (challenge.rule.type) {
          case 'min_orders': {
            const snap = await db
              .collection(`${storePath}/orders`)
              .where('timestamp', '>=', windowStart)
              .get();
            const count = snap.docs.filter((d) => {
              const o = d.data() as OrderData;
              return o.customerName && getCustomerId(o) === customerId && isEligibleOrder(o);
            }).length;
            completed = count >= challenge.rule.threshold;
            break;
          }
          case 'min_taps': {
            const snap = await db
              .collection(`${storePath}/orders`)
              .where('timestamp', '>=', windowStart)
              .get();
            const productIds = new Set<string>();
            for (const d of snap.docs) {
              const o = d.data() as OrderData;
              if (getCustomerId(o) !== customerId) continue;
              if (!isEligibleOrder(o)) continue;
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
            const snap = await db
              .collection(`${storePath}/orders`)
              .where('date', '==', after.date || todayYMD())
              .orderBy('timestamp', 'asc')
              .get();
            const customerOrders = snap.docs
              .map((d) => d.data() as OrderData)
              .filter((o) => o.customerName && getCustomerId(o) === customerId && isEligibleOrder(o));

            if (customerOrders.length >= 2) {
              const lastTs = customerOrders[customerOrders.length - 1].timestamp?.toMillis() || 0;
              const prevTs = customerOrders[customerOrders.length - 2].timestamp?.toMillis() || 0;
              const gapMinutes = (lastTs - prevTs) / 60000;
              completed = gapMinutes >= challenge.rule.threshold;
            }
            break;
          }
          case 'happy_boost': {
            const hSnap = await db
              .collection(`${storePath}/orders`)
              .where('timestamp', '>=', windowStart)
              .get();
            const hasOrder = hSnap.docs.some((d) => {
              const o = d.data() as OrderData;
              return o.customerName && getCustomerId(o) === customerId && isEligibleOrder(o);
            });
            completed = hasOrder;
            break;
          }
        }

        if (completed) {
          // 🔒 FIX: Transaction com dedup por orderId E por cliente.
          // - processedOrders: evita replay do mesmo orderId (at-least-once)
          // - completedCustomers: evita mesmo cliente ganhar múltiplas vezes
          const orderId = context.params.orderId;
          let shouldGeneratePrize = false;

          await db.runTransaction(async (txn) => {
            const cDoc = await txn.get(challengeDoc.ref);
            const data = cDoc.data();
            const processed: string[] = data?.processedOrders || [];
            const completedCusts: string[] = data?.completedCustomers || [];

            if (processed.includes(orderId)) {
              console.log(`[challenge] orderId ${orderId} already processed for "${challenge.title}" — skip`);
              return;
            }
            if (completedCusts.includes(customerId)) {
              console.log(`[challenge] ${customerId} already won "${challenge.title}" — skip (race)`);
              return;
            }

            txn.update(challengeDoc.ref, {
              completedCount: increment(1),
              processedOrders: admin.firestore.FieldValue.arrayUnion(orderId),
              completedCustomers: admin.firestore.FieldValue.arrayUnion(customerId),
            });
            shouldGeneratePrize = true;
          });

          if (shouldGeneratePrize) {
            console.log(`[challenge] ${customerId} completed "${challenge.title}"`);

            // Gerar prêmio — doc ID: prize_{challengeId}_{customerId}
            // (idempotente: mesmo cliente + mesmo desafio = mesmo doc)
            await generatePrize(
              franchiseId,
              storeId,
              customerId,
              maskName(after.customerName),
              challenge.rewardType as any,
              challenge.rewardDescription,
              orderId,
              challengeDoc.id
            );
          }
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
export const onOrderUpdatedGoldenServe = onDocumentUpdated(
  { document: 'franchises/{franchiseId}/stores/{storeId}/orders/{orderId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const change = { before: event.data.before, after: event.data.after };
    const context = { params: event.params };
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
    // 🔒 NOTE Bug-19: This query-then-decide pattern has a theoretical TOCTOU race
    // if two different golden-serve orders for the same customer fire concurrently.
    // However, golden serves are rare (1-in-N) and the deterministic orderId-based
    // prize doc ID (see generatePrize) prevents replay duplication. The residual
    // race window for two truly concurrent different orders is negligible.
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

/**
 * Gera prêmio no Firestore.
 *
 * Doc ID é determinístico para idempotência:
 * - Desafios: `prize_{challengeId}_{customerId}` (1 prêmio por cliente por desafio)
 * - Golden Serve: `prize_{orderId}` (1 prêmio por pedido premiado)
 *
 * @param challengeId - Se presente, indica que o prêmio veio de um desafio
 */
async function generatePrize(
  franchiseId: string,
  storeId: string,
  customerId: string,
  displayName: string,
  type: string,
  description: string,
  orderId: string,
  challengeId?: string
): Promise<void> {
  const storePath = `franchises/${franchiseId}/stores/${storeId}`;
  const code = generatePrizeCode();
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(now.toDate().getTime() + 30 * 60 * 1000) // 30 min
  );

  const prize: Record<string, unknown> = {
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

  if (challengeId) {
    prize.challengeId = challengeId;
  }

  // Doc ID determinístico:
  // - Desafio: prize_{challengeId}_{customerId} → 1 prêmio/cliente/desafio (idempotente)
  // - Golden Serve: prize_{orderId} → 1 prêmio/pedido (idempotente)
  const prizeDocId = challengeId
    ? `prize_${challengeId}_${customerId}`
    : `prize_${orderId}`;

  // 🔒 FIX #3: Transaction para não sobrescrever code existente em retry
  const prizeRef = db.doc(`${storePath}/prizes/${prizeDocId}`);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(prizeRef);
    if (existing.exists) {
      console.log(`[prize] Doc ${prizeDocId} already exists — skip (idempotent)`);
      return;
    }
    tx.set(prizeRef, prize);
  });
  console.log(`[prize] Created ${type} prize for ${displayName}: ${code} (doc: ${prizeDocId})`);
}

// ============================================================================
// 5. expirePrizes (Scheduled)
// ============================================================================

/**
 * A cada 5 minutos, expira prêmios não resgatados (30 min após wonAt).
 * Usa collectionGroup para evitar N+1 queries (franchise → store iteration).
 */
export const expirePrizes = onSchedule(
  { schedule: 'every 5 minutes', region: REGION },
  async () => {
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
 * A cada 5 minutos, desativa Modo Evento se expirado.
 * Usa collectionGroup para evitar N+1 queries.
 * ⚡ COST-OPT: Reduzido de 1→5 min — atraso imperceptível na expiração.
 */
export const expireEventMode = onSchedule(
  { schedule: 'every 5 minutes', region: REGION },
  async () => {
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
            'eventMode.activateDynamicPricing': false,
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
// 7. expireChallenges (Scheduled) — FIX #10
// ============================================================================

/**
 * A cada 5 minutos, marca desafios ativos cujo endsAt já passou como 'expired'.
 * Sem isso, o status fica 'active' eternamente no Firestore (client faz check visual,
 * mas o dado fica sujo e Cloud Functions continuam tentando processá-los).
 */
export const expireChallenges = onSchedule(
  { schedule: 'every 5 minutes', region: REGION },
  async () => {
    const now = admin.firestore.Timestamp.now();
    console.log('[challenges] Checking for expired challenges...');

    try {
      const activeSnap = await db
        .collectionGroup('challenges')
        .where('status', '==', 'active')
        .get();

      let expired = 0;
      for (const doc of activeSnap.docs) {
        const data = doc.data();
        if (
          data?.endsAt &&
          (typeof data.endsAt.toMillis === 'function' ? data.endsAt.toMillis() : (data.endsAt.seconds || 0) * 1000) <= now.toMillis()
        ) {
          await doc.ref.update({
            status: 'expired',
            updatedAt: serverTimestamp(),
          });
          expired++;
          console.log(`[challenges] Expired "${data.title}" (${doc.ref.path})`);
        }
      }

      if (expired > 0) {
        console.log(`[challenges] Expired ${expired} challenge(s)`);
      } else {
        console.log('[challenges] No expired challenges found');
      }
    } catch (err) {
      console.error('[challenges] Error expiring challenges:', err);
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
      updatePayload['eventMode.activateDynamicPricing'] = false;
      console.log(`[milestone] 🔥 Event mode activated: ${eventLabel}`);
    }

    tx.update(statsRef, updatePayload);
  });
}
