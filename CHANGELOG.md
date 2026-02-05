# CHANGELOG

Data: 2026-02-05

## Correcoes aplicadas (Fase 2-5)

1. Caminhos canonicos unificados (sem legacy)
- Evidencia: `src/lib/pathResolver.ts` linhas 30-106 (stores/subcollections canonicas).
- Evidencia: `admin/src/lib/pathResolver.ts` linhas 15-67 (stores/subcollections canonicas).
- Evidencia: `firestore.rules` linhas 169 e 230 (match `/franchises` e `/stores`).

2. Sync offline com idempotencia minima (_lastSyncId)
- Evidencia: `src/services/syncService.ts` linhas 183-200.
- Evidencia: `src/services/salesService.ts` linhas 158-170 (enqueue de `orders` com docId estavel).

3. UI do Kiosk usa `orders` (padrao canonico)
- Evidencia: `src/components/OrderHistory.tsx` linhas 95-96.

4. Indices alinhados com queries reais
- Evidencia: `firestore.indexes.json` linhas 4-181.
- Evidencia: `src/services/franchiseService.ts` linhas 227-229 e 432-433 (members).
- Evidencia: `admin/src/services/notificationService.ts` linhas 122-124 e 303-304 (notifications).
- Evidencia: `admin/src/services/auditService.ts` linhas 114-129 (auditLogs).
- Evidencia: `admin/src/components/store/StoreOrdersTab.tsx` linhas 36-42 (orders).
- Evidencia: `admin/src/services/userService.ts` linhas 161-162 (invitations).

5. Relatorio de arquitetura atualizado para schema canonico
- Evidencia: `docs/data-architecture-report.md` linhas 1-160.

6. Docs oficiais + arquivos arquivados
- Evidencia: `README.md` linhas 86-91 (docs canonicos + archives).
- Evidencia: `docs/FINAL_REVIEW.md` linhas 33-44 (lista de dead code removido).

7. Readiness e review final adicionados
- Evidencia: `docs/DEPLOY_READINESS.md` linhas 1-70.
- Evidencia: `docs/FINAL_REVIEW.md` linhas 1-75.

8. Auditoria global inclui franchiseId/storeId no log de claims
- Evidencia: `functions/src/auth/claims.ts` linhas 116-132.

## Arquivos impactados (principais)

- `src/lib/pathResolver.ts`
- `admin/src/lib/pathResolver.ts`
- `firestore.rules`
- `firestore.indexes.json`
- `src/services/syncService.ts`
- `src/services/salesService.ts`
- `src/components/OrderHistory.tsx`
- `functions/src/auth/claims.ts`
- `docs/data-architecture-report.md`
- `docs/DEPLOY_READINESS.md`
- `docs/FINAL_REVIEW.md`
- `README.md`
- `CHANGELOG.md`

## Definition of Done (Checklist)

- [x] `npm run lint` (root)
- [x] `npm run build` (root)
- [x] `npm run test` (root)
- [x] `npm run lint` (admin)
- [x] `npm run build` (admin)
- [x] `npm run test` (admin)
- [x] `npm run build` (functions)
- [x] `npm run test` (functions)
- [ ] `firebase deploy --only firestore:rules` (se rules alteradas)
- [ ] `firebase deploy --only firestore:indexes` (se indexes alterados)
- [ ] Smoke: login + selecao de franquia/loja (Admin e Kiosk)
- [ ] Smoke: registrar pedido no Kiosk e validar em `orders` no Admin
- [ ] Smoke: metrics/dailyStats atualizando apos venda
