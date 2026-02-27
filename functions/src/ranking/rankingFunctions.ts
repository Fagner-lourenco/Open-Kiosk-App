/**
 * ============================================================================
 * Ranking Cloud Functions â€” AgregaÃ§Ã£o server-side para TV Dashboard
 * ============================================================================
 *
 * 1. onOrderUpdatedRanking: Atualiza ranking quando customerName Ã© adicionado
 * 2. recalculateRanking30min: Scheduled (cada 3 min) recalcula janela 30 min
 * 3. checkChallengeCompletion: Verifica desafios apÃ³s order
 * 4. goldenServe: PremiaÃ§Ã£o 1-em-N determinÃ­stica
 * 5. expirePrizes: Scheduled para expirar prÃªmios nÃ£o resgatados
 * 6. expireEventMode: Scheduled para desativar modo evento expirado
 *
 * @author Open Kiosk Project
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
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
 * Quando um order Ã© atualizado com customerName (via enrichOrderWithCustomerData),
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

    // SÃ³ agrega quando customerName aparece (vindo de enrichOrder)
    const nameAppeared = !before.customerName && !!after.customerName;
    // Ou quando status muda para completed/dispensing com nome jÃ¡ presente
    const statusChanged =
      after.customerName &&
      before.status !== after.status &&
      ['completed', 'paid_pending_dispense', 'dispensing'].includes(after.status);

    if (!nameAppeared && !statusChanged) return;
    // Evitar dupla contagem: sÃ³ processa se nameAppeared OU se foi apenas mudanÃ§a de status
    if (!nameAppeared && statusChanged && before.customerName) {
      // Status changed mas nome jÃ¡ existia â€” nÃ£o recontar
      return;
    }

    // Guard: sÃ³ agrega pedidos em status elegÃ­vel
    if (!['completed', 'paid_pending_dispense', 'dispensing'].includes(after.status)) return;

    // Guard: sÃ³ agrega pedidos com customerName real (evita entradas fantasma)
    if (!after.customerName) return;

    // P1-24: Rejeitar pedidos com paymentStatus fora do esperado
    const invalidPaymentStatuses = ['failed', 'canceled', 'cancelled', 'refunded', 'expired'];
    if (after.paymentStatus && invalidPaymentStatuses.includes(after.paymentStatus)) {
      logger.info(`[ranking] Skipping order with invalid paymentStatus: ${after.paymentStatus}`);
      return;
    }

    const customerId = getCustomerId(after);
    const baseMl = calcTotalMl(after.items);
    const date = after.date || todayYMD();

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;

    // ðŸš€ bonus_multiplier: Verificar se o cliente tem prÃªmio ativo de multiplicador
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
        // Verificar se pelo menos um nÃ£o expirou
        const now = Date.now();
        const hasActive = bonusSnap.docs.some((d) => {
          const expiresAt = d.data().expiresAt;
          if (!expiresAt) return true;
          const ms = typeof expiresAt.toMillis === 'function' ? expiresAt.toMillis() : (expiresAt.seconds || 0) * 1000;
          return ms > now;
        });
        if (hasActive) {
          multiplier = 2;
          logger.info(`[ranking] ðŸš€ bonus_multiplier ativo para ${customerId} â†’ 2Ã— pontos!`);
        }
      }
    } catch (err) {
      logger.warn(`[ranking] Erro ao verificar bonus_multiplier para ${customerId}:`, err);
    }

    const totalMl = baseMl * multiplier;

    logger.info(`[ranking] Aggregating for ${customerId}: +${totalMl}mL (base=${baseMl}, Ã—${multiplier}), store=${storeId}`);

    const rankingRef = db.doc(`${storePath}/rankingAgg/${customerId}`);
    const eventStatsRef = db.doc(`${storePath}/eventStats/current`);

    try {
      // Use transaction for atomic read-then-write (prevents race conditions
      // when concurrent triggers fire for the same customer)
      await db.runTransaction(async (tx) => {
        const existingDoc = await tx.get(rankingRef);
        const statsDoc = await tx.get(eventStatsRef);
        const isNewCustomer = !existingDoc.exists;
        // ðŸ”§ FIX: Detectar troca de dia â€” doc existe mas Ã© de ontem
        const existingDate = existingDoc.exists ? existingDoc.data()?.date : null;
        const isDayChange = existingDoc.exists && existingDate !== date;
        // Para uniqueCustomers: considerar "novo para hoje" se Ã© novo OU mudou de dia
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
          // ðŸ”§ FIX: Dia mudou â€” resetar contadores ao invÃ©s de acumular
          tx.set(rankingRef, {
            customerId,
            displayName: maskName(after.customerName || 'AnÃ´nimo'),
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
            displayName: maskName(after.customerName || 'AnÃ´nimo'),
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
            // ðŸ”’ FIX #2: Resetar milestones.reached na virada de dia
            const prevMilestones = (currentData?.milestones || []) as Array<{ targetMl: number; label: string; reached: boolean }>;
            const resetMilestones = prevMilestones.map((m) => ({ ...m, reached: false, reachedAt: null }));
            // ðŸ”’ FIX #9: Preservar eventMode se ainda nÃ£o expirou
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
            // Same day â€” increment counters, only increment uniqueCustomers for new customers
            const updateData: Record<string, unknown> = {
              totalMl: increment(totalMl),
              totalServes: increment(1),
              updatedAt: serverTimestamp(),
            };
            if (isNewForToday) {
              // ðŸ”§ FIX: Contar clientes que retornam de dia anterior como novos para hoje
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

      // Check milestones (outside transaction â€” reads fresh data)
      await checkMilestones(franchiseId, storeId);

      logger.info(`[ranking] âœ… Aggregated for ${customerId}`);
    } catch (error) {
      logger.error(`[ranking] âŒ Error aggregating for ${customerId}:`, error);
    }
  });

// ============================================================================
// 2. recalculateRanking30min (Scheduled)
// ============================================================================

/**
 * A cada 10 minutos, recalcula totalMl30min para todos os clientes.
 * Query: orders dos Ãºltimos 30 min com customerName.
 * âš¡ COST-OPT: Reduzido de 3â†’10 min â€” a CF onOrderUpdatedRanking jÃ¡ faz
 *   incremento real-time; esta CF sÃ³ recalcula janela deslizante de 30min.
 */
// ðŸ”’ FIX BUG-32: Add memory/timeout for store-wide iteration
export const recalculateRanking30min = onSchedule(
  { schedule: 'every 10 minutes', region: REGION, memory: '512MiB', timeoutSeconds: 300 },
  async () => {
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const thirtyMinTimestamp = admin.firestore.Timestamp.fromDate(thirtyMinAgo);
    const today = todayYMD();

    logger.info('[ranking30m] Recalculating 30-min window...');

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
        logger.error(`[ranking30m] Error for store ${storeDoc.id}:`, err);
      }
    }

    logger.info('[ranking30m] âœ… Done');
  });

async function recalculate30minForStore(
  franchiseId: string,
  storeId: string,
  since: admin.firestore.Timestamp,
  today: string
): Promise<void> {
  const storePath = `franchises/${franchiseId}/stores/${storeId}`;

  // Buscar orders dos Ãºltimos 30 min
  const ordersSnap = await db
    .collection(`${storePath}/orders`)
    .where('timestamp', '>=', since)
    .where('date', '==', today)
    .get();

  // âš¡ COST-OPT: Early-exit quando nÃ£o hÃ¡ orders recentes â€” evita reads desnecessÃ¡rios de ranking/prizes
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
      logger.info(`[ranking30m] Zeroed ${rankingSnap.size} stale 30min docs for ${storeId}`);
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

  // ðŸš€ FIX #8: Aplicar bonus_multiplier no cÃ¡lculo de 30min (consistÃªncia com ranking diÃ¡rio)
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
        logger.warn(`[ranking30m] Erro ao verificar bonus_multiplier para ${custId}:`, err);
      }
    }
  }

  // Pegar ranking atual
  const rankingSnap = await db
    .collection(`${storePath}/rankingAgg`)
    .where('date', '==', today)
    .get();

  // Batch update â€” ðŸ”§ FIX: Chunking para respeitar limite de 500 ops por batch
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
    logger.info(`[ranking30m] Updated ${updates.length} ranking docs for ${storeId}`);
  }
}

// ============================================================================
// 3. checkChallengeCompletion
// ============================================================================

/**
 * Verifica se o pedido do cliente completa algum desafio ativo.
 * Chamado internamente apÃ³s ranking update.
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

    // SÃ³ processa quando customerName aparece
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

      // ðŸ”’ FIX: Verificar endsAt (belt-and-suspenders â€” nÃ£o confiar apenas em status)
      if (challenge.endsAt && challenge.endsAt.toMillis() < Date.now()) {
        logger.info(`[challenge] "${challenge.title}" expirou (endsAt passed) â€” skip`);
        continue;
      }

      // ðŸ”’ FIX: Dedup per-client â€” cada cliente ganha no mÃ¡ximo 1 vez por desafio
      const alreadyCompleted = (challenge.completedCustomers || []).includes(customerId);
      if (alreadyCompleted) {
        logger.info(`[challenge] ${customerId} jÃ¡ completou "${challenge.title}" â€” skip`);
        continue;
      }

      const windowMs = challenge.rule.windowMinutes * 60 * 1000;
      const windowStart = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - windowMs)
      );

      try {
        let completed = false;

        // ðŸ”’ FIX #1: Helper para validar se order Ã© elegÃ­vel (mesma lÃ³gica do ranking)
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
              // Encontrar o maior gap entre quaisquer orders consecutivas
              let maxGap = 0;
              for (let g = 1; g < customerOrders.length; g++) {
                const ts = customerOrders[g].timestamp?.toMillis() || 0;
                const prevTs = customerOrders[g - 1].timestamp?.toMillis() || 0;
                const gap = (ts - prevTs) / 60000;
                if (gap > maxGap) maxGap = gap;
              }
              completed = maxGap >= challenge.rule.threshold;
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
          // ðŸ”’ FIX: Transaction com dedup por orderId E por cliente.
          // - processedOrders: evita replay do mesmo orderId (at-least-once)
          // - completedCustomers: evita mesmo cliente ganhar mÃºltiplas vezes
          const orderId = context.params.orderId;
          let shouldGeneratePrize = false;

          await db.runTransaction(async (txn) => {
            const cDoc = await txn.get(challengeDoc.ref);
            const data = cDoc.data();
            const processed: string[] = data?.processedOrders || [];
            const completedCusts: string[] = data?.completedCustomers || [];

            if (processed.includes(orderId)) {
              logger.info(`[challenge] orderId ${orderId} already processed for "${challenge.title}" â€” skip`);
              return;
            }
            if (completedCusts.includes(customerId)) {
              logger.info(`[challenge] ${customerId} already won "${challenge.title}" â€” skip (race)`);
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
            logger.info(`[challenge] ${customerId} completed "${challenge.title}"`);

            // Gerar prÃªmio â€” doc ID: prize_{challengeId}_{customerId}
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
        logger.error(`[challenge] Error checking ${challenge.title}:`, err);
      }
    }
  });

// ============================================================================
// 4. goldenServe (Bilhete Premiado)
// ============================================================================

/**
 * Verifica se o serve Ã© um "serve dourado" (1 em N determinÃ­stico).
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

    // SÃ³ processa quando customerName aparece (primeiro enrich)
    if (!(!before.customerName && after.customerName)) return;
    if (!after.customerName) return;

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;

    // Ler config do golden serve
    const tvConfigDoc = await db.doc(`${storePath}/tvConfig/current`).get();
    const tvConfig = tvConfigDoc.data();
    const goldenConfig = tvConfig?.goldenServe;

    if (!goldenConfig?.enabled || !goldenConfig?.frequency) return;

    // Hash determinÃ­stico: simples mas auditÃ¡vel
    let hash = 0;
    for (let i = 0; i < orderId.length; i++) {
      const char = orderId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const isGolden = Math.abs(hash) % goldenConfig.frequency === 0;

    if (!isGolden) return;

    logger.info(`[goldenServe] ðŸŽ‰ Order ${orderId} is a golden serve!`);

    // Determinar tipo de prÃªmio (weighted random)
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
    // ðŸ”’ NOTE Bug-19: This query-then-decide pattern has a theoretical TOCTOU race
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
        logger.info(`[goldenServe] Pix limit reached for ${customerId}, falling back to coupon`);
      }
    }

    const descriptions = goldenConfig.prizeDescriptions || {
      coupon: 'Cupom de desconto',
      free_drink: 'Chope grÃ¡tis',
      pix: 'Pix premiado',
      custom: 'PrÃªmio especial',
    };

    await generatePrize(
      franchiseId,
      storeId,
      getCustomerId(after),
      maskName(after.customerName),
      prizeType,
      descriptions[prizeType] || 'PrÃªmio',
      orderId
    );
  });

// ============================================================================
// HELPER: Gerar prÃªmio
// ============================================================================

/**
 * Gera prÃªmio no Firestore.
 *
 * Doc ID Ã© determinÃ­stico para idempotÃªncia:
 * - Desafios: `prize_{challengeId}_{customerId}` (1 prÃªmio por cliente por desafio)
 * - Golden Serve: `prize_{orderId}` (1 prÃªmio por pedido premiado)
 *
 * @param challengeId - Se presente, indica que o prÃªmio veio de um desafio
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

  // Doc ID determinÃ­stico:
  // - Desafio: prize_{challengeId}_{customerId} â†’ 1 prÃªmio/cliente/desafio (idempotente)
  // - Golden Serve: prize_{orderId} â†’ 1 prÃªmio/pedido (idempotente)
  const prizeDocId = challengeId
    ? `prize_${challengeId}_${customerId}`
    : `prize_${orderId}`;

  // ðŸ”’ FIX #3: Transaction para nÃ£o sobrescrever code existente em retry
  const prizeRef = db.doc(`${storePath}/prizes/${prizeDocId}`);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(prizeRef);
    if (existing.exists) {
      logger.info(`[prize] Doc ${prizeDocId} already exists â€” skip (idempotent)`);
      return;
    }
    tx.set(prizeRef, prize);
  });
  logger.info(`[prize] Created ${type} prize for ${displayName}: ${code.slice(0, 2)}****${code.slice(-2)} (doc: ${prizeDocId})`);
}

// ============================================================================
// 5. expirePrizes (Scheduled)
// ============================================================================

/**
 * A cada 5 minutos, expira prÃªmios nÃ£o resgatados (30 min apÃ³s wonAt).
 * Usa collectionGroup para evitar N+1 queries (franchise â†’ store iteration).
 */
export const expirePrizes = onSchedule(
  { schedule: 'every 5 minutes', region: REGION },
  async () => {
    const now = admin.firestore.Timestamp.now();
    logger.info('[prizes] Checking for expired prizes...');

    try {
      const expiredSnap = await db
        .collectionGroup('prizes')
        .where('status', '==', 'won')
        .where('expiresAt', '<=', now)
        .get();

      if (expiredSnap.empty) {
        logger.info('[prizes] No expired prizes found');
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

      logger.info(`[prizes] Expired ${expiredSnap.size} prizes total`);
    } catch (err) {
      logger.error('[prizes] Error expiring prizes:', err);
    }
  });

// ============================================================================
// 6. expireEventMode (Scheduled)
// ============================================================================

/**
 * A cada 5 minutos, desativa Modo Evento se expirado.
 * Usa collectionGroup para evitar N+1 queries.
 * âš¡ COST-OPT: Reduzido de 1â†’5 min â€” atraso imperceptÃ­vel na expiraÃ§Ã£o.
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
          logger.info(`[eventMode] Expired for doc ${doc.ref.path}`);
        }
      }

      if (expired > 0) {
        logger.info(`[eventMode] Expired ${expired} event(s)`);
      }
    } catch (err) {
      logger.error('[eventMode] Error expiring event modes:', err);
    }
  });

// ============================================================================
// 7. expireChallenges (Scheduled) â€” FIX #10
// ============================================================================

/**
 * A cada 5 minutos, marca desafios ativos cujo endsAt jÃ¡ passou como 'expired'.
 * Sem isso, o status fica 'active' eternamente no Firestore (client faz check visual,
 * mas o dado fica sujo e Cloud Functions continuam tentando processÃ¡-los).
 */
export const expireChallenges = onSchedule(
  { schedule: 'every 5 minutes', region: REGION },
  async () => {
    const now = admin.firestore.Timestamp.now();
    logger.info('[challenges] Checking for expired challenges...');

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
          logger.info(`[challenges] Expired "${data.title}" (${doc.ref.path})`);
        }
      }

      if (expired > 0) {
        logger.info(`[challenges] Expired ${expired} challenge(s)`);
      } else {
        logger.info('[challenges] No expired challenges found');
      }
    } catch (err) {
      logger.error('[challenges] Error expiring challenges:', err);
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
      activatesEventMode?: boolean;
      eventMinutes?: number;
    }>;

    let milestonesUpdated = false;
    let activateEventMode = false;
    let eventLabel = '';
    let eventMinutes = 10;

    for (const milestone of milestones) {
      if (!milestone.reached && totalMl >= milestone.targetMl) {
        milestone.reached = true;
        milestonesUpdated = true;

        // Usa campo booleano (fallback: regex no label para retrocompatibilidade)
        if (milestone.activatesEventMode) {
          eventMinutes = milestone.eventMinutes || 10;
          activateEventMode = true;
          eventLabel = milestone.label;
        } else if (milestone.label.toLowerCase().includes('modo evento')) {
          // Retrocompatibilidade: labels antigos sem o campo booleano
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
      logger.info(`[milestone] ðŸ”¥ Event mode activated: ${eventLabel}`);
    }

    tx.update(statsRef, updatePayload);
  });
}
