# Final Review - Deploy Readiness (Open-Kiosk-App)

Data: 2026-02-05
Escopo: runtime de producao (src/, admin/src/, functions/src/, android/, firebase.*, shared/).

## Resumo executivo

1. Caminhos Firestore agora sao canonicos (multi-tenant) e consistentes entre Kiosk/Admin/Functions.
2. Sync offline ganhou idempotencia minima (_lastSyncId) para evitar duplicacao.
3. Indices foram alinhados com queries reais de producao.
4. Documentacao antiga foi arquivada em `docs/archives/`, mantendo docs oficiais no README.

## Evidencias chave

1. Canonico no Kiosk: `src/lib/pathResolver.ts` linhas 30-106 (stores/subcollections canonicas).
2. Canonico no Admin: `admin/src/lib/pathResolver.ts` linhas 15-67 (stores/subcollections canonicas).
3. Rules canonicas: `firestore.rules` linhas 169 e 230 (match `/franchises/{franchiseId}` e `/stores/{storeId}`).
4. Idempotencia no sync: `src/services/syncService.ts` linhas 183-200 (`_lastSyncId`, `_syncedAt`).
5. UI usa `orders` (nao `sales`): `src/components/OrderHistory.tsx` linhas 95-96.
6. Audit log inclui franchiseId/storeId: `functions/src/auth/claims.ts` linhas 116-132.
7. Indices em producao: `firestore.indexes.json` linhas 4-181.
8. Docs oficiais listadas no README: `README.md` linhas 86-91.

## Inventario Legacy (removido/migrado)

| Item | Onde (arquivo:linha) | Tipo | Impacto | Plano |
| --- | --- | --- | --- | --- |
| Root `/stores/{storeId}` | `firestore.rules` linhas 169/230 | Rules | Somente path canonico permanece | Remocao do legado e padrao canonico |
| Resolver legacy (fallback root) | `src/lib/pathResolver.ts` linhas 30-106 | Kiosk | Nao ha bifurcacao de path | Resolver canonico unico |
| Resolver legacy (fallback root) | `admin/src/lib/pathResolver.ts` linhas 15-67 | Admin | Nao ha bifurcacao de path | Resolver canonico unico |
| Colecao `sales` no Kiosk UI | `src/components/OrderHistory.tsx` linhas 95-96 | Kiosk | UI usa `orders` | Padrao canonico usado |

## Dead Code (removido)

Origem: `git diff --name-status` (auditado na data deste review).

```text
src/components/StoreInitialization.tsx
src/hooks/useAdminPin.ts
src/hooks/useFirebaseReports.tsx
src/schemas/firestore.ts
src/services/setupKioskController.ts
src/integrations/supabase/types.ts
admin/src/services/metricsService.ts
```

## Dead Docs (arquivados)

Documentos fora do fluxo de deploy foram movidos para `docs/archives/`.
Docs oficiais permanecem listados no README.

Evidencia: `README.md` linhas 86-91 (lista de docs canonicos).

## Baseline de comandos

Ver `docs/DEPLOY_READINESS.md` para logs resumidos e checklist.

## Riscos e mitigacoes

1. Warnings de chunk size no build (root/admin).
   - Risco: bundle maior e tempo de carregamento.
   - Mitigacao: lazy import de paginas pesadas + manualChunks (se necessario).

2. Segredos em Firestore (paymentGatewayConfig.accessToken).
   - Risco: exposicao de credenciais.
   - Mitigacao: migrar para Secret Manager ou criptografia no backend.

## Rollback simples

1. Reverter o commit deste pacote de mudancas (quando commitado).
2. Alternativamente, restaurar apenas arquivos criticos (pathResolver, rules, indexes) para a ultima versao estavel.

## Definition of Done (status)

- [x] Root: lint/build/test
- [x] Admin: lint/build/test
- [x] Functions: build/test
- [ ] Deploy rules/indexes (se alterados)
- [ ] Smoke tests (login, franquia/loja, orders, metrics)
