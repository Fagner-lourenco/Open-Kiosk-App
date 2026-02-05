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

## Correcoes aplicadas (Pagamentos + PagBank + Hardening)

1. PaymentGatewayConfig canonico e providers alinhados (shared/admin/kiosk)
Evidencia: `shared/types/store.ts` linhas 70-139 (provider, enabledMethods, providers, legacy read-compat).
Evidencia: `shared/schemas/store.schema.ts` linhas 83-111 (PaymentGatewayConfigSchema canonico).
Evidencia: `admin/src/types/store.ts` linhas 24-74 (provider e providers).
Evidencia: `src/types/store.ts` linhas 170-216 (PaymentGatewayConfig canonico).
Antes: provider limitado e campos legacy misturados sem enabledMethods/padroes.
Depois: schema canonico com provider `none|mercado_pago|mercadopago|pagbank`, enabledMethods e providers sem segredos.

2. Kiosk passou a normalizar pagamento a partir do doc principal da loja (sem duplicar settings/config)
Evidencia: `src/config/paymentGateway.ts` linhas 50-98 (normalizePaymentGatewayConfigFromStore).
Evidencia: `src/hooks/useStoreSettings.tsx` linhas 397-409 (remove paymentGatewayConfig do payload de settings/config).
Evidencia: `src/hooks/useStoreSettings.tsx` linhas 1465-1473 (store listener aplica paymentGatewayConfig).
Antes: `paymentGatewayConfig` era gravado em `settings/config`.
Depois: leitura canonica do doc da loja com read-compat de legacy, sem escrita duplicada.

3. Admin consolidou validacao PagBank e removeu segredos do payload
Evidencia: `admin/src/components/store/StoreSettingsTab.tsx` linhas 180-209 (validacao PagBank).
Evidencia: `admin/src/components/store/StoreSettingsTab.tsx` linhas 170-179 (sanitizacao remove accessToken/mode etc).
Antes: inputs/validacao permissivos e legado exposto.
Depois: valida `clientId`/`publicKey` e remove campos sensiveis do save.

4. Admin Kiosk virou somente leitura para pagamentos
Evidencia: `src/components/AdminPaymentGatewayHub.tsx` linhas 22-52 (alerta read-only e badge).
Antes: Kiosk podia editar e gravar config local.
Depois: UI de resumo com orientacao para Admin Web.

5. Contexto de pagamentos unificou metodos e configuracao
Evidencia: `src/context/PaymentGatewayContext.tsx` linhas 12-78 (enabledMethods inclui cash + isPaymentConfigured).
Evidencia: `src/config/paymentGateway.ts` linhas 230-257 (isPaymentConfigured com PagBank).
Antes: cash nao era considerado e configuracao dependia de campos legados.
Depois: cash habilitado por padrao e configuracao avaliada por provider.

6. PagBank backend com provider isolado e webhook seguro
Evidencia: `functions/src/payments/types.ts` linhas 1-40 e 138-143 (contratos PaymentProvider).
Evidencia: `functions/src/payments/providers/pagbank/index.ts` linhas 1-168 (createPayment + Pix/Cartao).
Evidencia: `functions/src/payments/index.ts` linhas 20-108 (createPayment, pagbankWebhook, assinatura).
Evidencia: `functions/src/payments/paymentService.ts` linhas 180-247 e 310-325 (createPaymentIntent + verifyPagBankSignature).
Antes: nao havia provider PagBank nem webhook.
Depois: createPayment callable, webhook validado e reconciliacao agendada.

7. Kiosk integrou createPayment generico + listener de status
Evidencia: `src/services/paymentService.ts` linhas 690-726 (createPayment + watchPaymentStatus).
Evidencia: `src/components/Checkout.tsx` linhas 440-478 (createPayment + watchPaymentStatus).
Evidencia: `src/components/DrinkQuickCheckoutModal.tsx` linhas 660-708 (createPayment + watchPaymentStatus).
Antes: fluxos de pagamento acoplados ao Mercado Pago.
Depois: fluxo generico com PagBank Pix/Cartao e listener Firestore.

8. Migracao com dry-run/commit e rollback
Evidencia: `functions/src/migrations/consolidatePaymentGatewayConfig.ts` linhas 1-120 (consolidacao + registro).
Evidencia: `functions/src/migrations/consolidatePaymentGatewayConfig.ts` linhas 159-203 (rollback).
Antes: nao havia migracao formal nem rollback.
Depois: callable com dry-run, commit e rollback por runId.

9. Hardening de runtime (AuthGate + Firebase config)
Evidencia: `src/App.tsx` linhas 10-56 e 122-135 (AuthGate sob AuthContextProvider).
Evidencia: `src/services/firebase.ts` linhas 17-36 (hasValidFirebaseConfig/isFirebaseInitialized).
Evidencia: `src/hooks/useStoreSettings.tsx` linhas 453-456 (guard contra firebaseConfig vazio).
Antes: erro "useAuth deve ser usado dentro de AuthContextProvider" e Listen 400 com config vazio.
Depois: provider sempre montado e init protegido.

10. Regras de acesso para pagamentos e docs de arquitetura
Evidencia: `firestore.rules` linhas 309-320 (match /payments).
Evidencia: `docs/PAYMENT_GATEWAY_ARCHITECTURE.md` linhas 1-78 (schema + fluxo + migracao).
Antes: colecao de pagamentos sem regra e sem doc.
Depois: regra read-only para app e docs de arquitetura.

11. Sanitizacao extra e consistencia de paths
Evidencia: `src/hooks/useFirebaseProducts.tsx` linhas 40-57 e 264-275 (sanitizeFirestoreData).
Evidencia: `src/services/syncService.ts` linhas 166-178 e 458-469 (doc path canonical).
Evidencia: `src/services/storeService.ts` linhas 37-53 e 168-188 (validacao + update existente).
Antes: updates com undefined e caminhos usando split.
Depois: sanitizacao consistente e paths sem split.

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
 - `docs/PAYMENT_GATEWAY_ARCHITECTURE.md`
 - `src/config/paymentGateway.ts`
 - `src/context/PaymentGatewayContext.tsx`
 - `src/services/paymentService.ts`
 - `src/components/Checkout.tsx`
 - `src/components/DrinkQuickCheckoutModal.tsx`
 - `src/components/AdminPaymentGatewayHub.tsx`
 - `src/hooks/useStoreSettings.tsx`
 - `src/services/firebase.ts`
 - `functions/src/payments/*`
 - `functions/src/migrations/consolidatePaymentGatewayConfig.ts`

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
