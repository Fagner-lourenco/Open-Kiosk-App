# CHANGELOG

Data: 2026-02-05

## Correcoes aplicadas

1. Normalizacao de paths para `inventoryLogs`
- Evidencia: `src/lib/pathResolver.ts` linhas 109-116 (suporte a `inventoryLogs`/`inventory_logs`).
- Evidencia: `admin/src/lib/pathResolver.ts` linhas 67-86 (paths de subcolecoes com `inventoryLogs`).
- Correcao: normalizacao para `inventoryLogs` em ambos os apps.

2. Offline sync usando path correto (franchise vs legacy)
- Evidencia: `src/services/syncService.ts` linhas 84-103 (uso de `getStoreDoc`).
- Correcao: sync agora resolve path via `getStoreDoc` para compatibilidade com franchise mode.

3. Correcoes em relatorios e metrics (admin)
- Evidencia: `admin/src/services/reportService.ts` linhas 145-172 (fallback de `productName`).
- Evidencia: `admin/src/services/reportService.ts` linhas 192-207 (fallback metrics `orders`/`revenue`).
- Correcao: leitura consistente com schema atual de metrics e itens.

4. Metrics e dailyStats com `franchiseId`/`storeId`
- Evidencia: `functions/src/analytics/aggOrders.ts` linhas 103-115 (grava `franchiseId`/`storeId`).
- Evidencia: `functions/src/analytics/aggregateDailySales.ts` linhas 21-34 (schema inclui `franchiseId`/`storeId`).
- Correcao: alinhamento com regras de collectionGroup e consultas do Admin.

5. Hardware status inclui `franchiseId`/`storeId`
- Evidencia: `src/services/hardwareStatusService.ts` linhas 24-53 e 115-137.
- Correcao: status de hardware agora atende regras e filtros por franquia.

6. Fluxo de convites com token (Admin + Functions)
- Evidencia: `admin/src/lib/invitationToken.ts` (geracao de token).
- Evidencia: `admin/src/pages/public/InvitePage.tsx` linhas 115-156 (busca por token).
- Evidencia: `functions/src/invitations/accept.ts` linhas 39-105 (aceite por token).
- Correcao: convites agora aceitos via `/invite/{token}` e endpoint publico de validacao.

7. Bugfix em `validateInvitationToken` (undefined variable)
- Evidencia: `functions/src/invitations/accept.ts` linhas 215-219 (validacao correta de `token`).
- Correcao: removida referencia inexistente a `invitationId`.

8. Roles e permissoes (employee)
- Evidencia: `shared/types/roles.ts` linhas 14-44 (role `employee`).
- Evidencia: `functions/src/lib/auth.ts` linhas 13-32 e 123-132 (role/hierarquia atualizada).
- Correcao: role `employee` padronizado entre apps e Functions.

9. Firestore rules e indexes alinhados com queries reais
- Evidencia: `firestore.rules` linhas 321-329 (inventoryLogs) e 648-656 (audit_logs leitura).
- Evidencia: `firestore.indexes.json` linhas 19-80 (notifications/invitations/auditLogs).
- Correcao: regras e indices agora cobrem paths e queries de producao.

10. Types alinhados com dados escritos
- Evidencia: `src/types/store.ts` linhas 187-195 (InventoryLog expandido).
- Evidencia: `src/types/franchise.ts` linhas 254-266 (User com `invitedBy`).
- Evidencia: `admin/src/types/user.ts` linhas 13-30 (User com `invitedBy`).
- Correcao: modelos refletem campos persistidos.

11. Convites com `storeAccess` (Admin/Functions/Kiosk)
- Evidencia: `admin/src/pages/team/TeamPage.tsx` linhas 248-259 (convite com `storeAccess`).
- Evidencia: `admin/src/pages/users/InvitationsPage.tsx` linhas 118-129 (convite com `storeAccess`).
- Evidencia: `admin/src/services/userService.ts` linhas 270-276 (derivacao de `storeAccess`).
- Evidencia: `functions/src/invitations/sendEmail.ts` linhas 111-124 (convite com `storeAccess`).
- Evidencia: `src/services/franchiseService.ts` linhas 65-72 e 621-626 (normalizacao no Kiosk).
- Correcao: `storeAccess` padronizado e compatibilidade garantida no aceite de convites.

12. Idempotencia e schema canonico de `orders` no Kiosk
- Evidencia: `src/services/salesService.ts` linhas 214-219 (docId = `orderNumber`).
- Evidencia: `src/hooks/useFirebaseReports.tsx` linhas 91-128 (docId estavel + `createdAt`/status).
- Evidencia: `src/hooks/useReports.tsx` linhas 380-415 (campos canonicos + timestamps).
- Correcao: evita duplicidade em retries e garante leitura por `createdAt`/status no Admin.

13. Atualizacao de estoque com `updatedAt`
- Evidencia: `src/services/salesService.ts` linhas 140-152 (updates incluem `updatedAt`).
- Evidencia: `firestore.rules` linhas 263-271 (update limitado + `updatedAt` permitido).
- Correcao: alinhamento entre cache e writes de estoque.

## Arquivos impactados

- `docs/data-architecture-report.md`
- `CHANGELOG.md`
- `src/lib/pathResolver.ts`
- `admin/src/lib/pathResolver.ts`
- `src/services/syncService.ts`
- `admin/src/services/reportService.ts`
- `functions/src/analytics/aggOrders.ts`
- `functions/src/analytics/aggregateDailySales.ts`
- `functions/src/analytics/getMetricsAdmin.ts`
- `functions/src/invitations/accept.ts`
- `functions/src/invitations/sendEmail.ts`
- `functions/src/lib/auth.ts`
- `functions/src/auth/setCustomClaims.ts`
- `src/services/hardwareStatusService.ts`
- `shared/types/roles.ts`
- `admin/shared/types/roles.ts`
- `shared/types/permissions.ts`
- `admin/shared/types/permissions.ts`
- `src/types/franchise.ts`
- `admin/src/types/franchise.ts`
- `admin/src/types/user.ts`
- `src/types/store.ts`
- `firestore.rules`
- `firestore.indexes.json`
- `admin/src/pages/public/InvitePage.tsx`
- `admin/src/pages/users/InvitationsPage.tsx`
- `admin/src/pages/team/TeamPage.tsx`
- `admin/src/services/userService.ts`
- `src/services/franchiseService.ts`
- `src/services/salesService.ts`
- `src/hooks/useFirebaseReports.tsx`
- `src/hooks/useReports.tsx`
- `src/hooks/useStoreSettings.tsx`

## Definition of Done (Checklist)

- [ ] `npm run lint` (root)
- [ ] `npm run build` (root)
- [ ] `npm run test` (root)
- [ ] `npm run lint` (admin)
- [ ] `npm run build` (admin)
- [ ] `npm run build` (functions)
- [ ] Revisar `firestore.rules` e `firestore.indexes.json` em deploy
- [ ] Validar convite por token (`/invite/{token}`)
- [ ] Validar metrics via `getMetricsAdmin` com usuario admin
- [ ] Smoke: login + selecao de franquia/loja (Admin e Kiosk)
- [ ] Smoke: registrar pedido no Kiosk e validar em `orders` no Admin
- [ ] Smoke: metrics/dailyStats atualizando apos venda
