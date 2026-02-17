# DATABASE_MAP (Fonte de Verdade do Código)

Atualizado em: 2026-02-16T17:19:58.713Z (UTC)
Commit auditado: `e2a602c`
Escopo: `admin/src`, `src`, `functions/src`, `firestore.rules`, `firestore.indexes.json`

## 1) Base canônica Firestore

- Modelo multi-tenant canônico: `franchises/{franchiseId}/stores/{storeId}`.
- Paths utilitários canônicos:
- `src/lib/pathResolver.ts`
- `admin/src/lib/pathResolver.ts`
- Helpers de acesso Kiosk:
- `src/services/firebase.ts`
- Entrypoint de Functions:
- `functions/src/index.ts`

## 2) Paths reais por camada

### Kiosk/App (`src`)

- Seleção de contexto (franchise/store via localStorage):
- leitura/gravação de `open-kiosk-admin:selectedFranchise` e `open-kiosk-admin:selectedStore` em `src/services/firebase.ts` e `src/context/FranchiseContext.tsx`.
- Leitura de loja e settings:
- `franchises/{franchiseId}/stores/{storeId}` em `src/services/storeSettingsService.ts` e `src/services/storeService.ts`.
- Checkout/pagamentos:
- grava em `franchises/{franchiseId}/stores/{storeId}/payments/{paymentId}` via callable (`createPayment`) e listener em `src/services/paymentService.ts`.
- Vendas/pedidos:
- grava/atualiza em `franchises/{franchiseId}/stores/{storeId}/orders/{orderId}` em `src/services/salesService.ts`.
- Hardware/ESP32:
- atualiza status de dispensa em `orders/{orderId}` via `salesService.updateOrderDispenseStatus()` em `src/context/ESP32Context.tsx`.
- Path legado ainda lido:
- `franchises/{franchiseId}/stores/{storeId}/settings/attract_video` em `src/components/AttractScreen.tsx`.

### Admin (`admin/src`)

- Paths canônicos de loja/franquia:
- `admin/src/lib/pathResolver.ts`.
- Pedidos:
- leitura em `franchises/{franchiseId}/stores/{storeId}/orders` (`admin/src/components/store/StoreOrdersTab.tsx`).
- Auditoria:
- canônico: `franchises/{franchiseId}/auditLogs` (`admin/src/lib/pathResolver.ts`, `admin/src/pages/audit/AuditPage.tsx`).
- fallback legado: `audit_logs` (`admin/src/pages/audit/AuditPage.tsx`).
- Comercial (CRM):
- `customers`, `deals`, `calendarItems`, `commercialEvents`, `quotes` por hooks em `admin/src/hooks/useCustomers.ts`, `admin/src/hooks/useDeals.ts`, `admin/src/hooks/useCalendarItems.ts`, `admin/src/hooks/useCommercialEvents.ts`, `admin/src/hooks/useQuotes.ts`.
- Financeiro (flat `fin*` dentro da loja):
- `finAccounts`, `finCategories`, `finCostCenters`, `finParties`, `finLedger`, `finInvoices`, `finBills`, `finPayments` via hooks `useFin*` e `admin/src/lib/pathResolver.ts`.
- Telão público de ranking:
- rota `admin/src/App.tsx` (`/ranking/display/:storeId`) usa `admin/src/pages/ranking/TvDashboardPage.tsx` e hooks agregados:
- `admin/src/hooks/useTvDashboard.ts` -> `tvConfig/current`, `eventStats/current`
- `admin/src/hooks/useTvRanking.ts` -> `rankingAgg`
- `admin/src/hooks/useTvChallenges.ts` -> `challenges`
- `admin/src/hooks/useTvWinners.ts` -> `prizes`
- página legada `admin/src/pages/ranking/RankingDisplayPage.tsx` removida no estado atual.

### Functions (`functions/src`)

- Auth/Claims:
- `users`, `superadmins`, `franchises/{franchiseId}/members/{userId}` em `functions/src/auth/*.ts`.
- Convites:
- `invitations`, `franchises/{franchiseId}/members` em `functions/src/invitations/*.ts`.
- Billing:
- `franchises/{franchiseId}`, `franchises/{franchiseId}/billingEvents` em `functions/src/billing/*.ts`.
- Payments:
- `franchises/{franchiseId}/stores/{storeId}/payments/{paymentId}` e notificações em `franchises/{franchiseId}/notifications` (`functions/src/payments/*.ts`).
- Analytics/ERP/Ranking:
- leituras/escritas em `orders`, `dailyStats`, `metrics`, `taps`, `kegs`, `servingSessions`, `wastageEvents`, `rankingAgg`, `eventStats`, `tvConfig`, `challenges`, `prizes` (`functions/src/analytics/*.ts`, `functions/src/erp/*.ts`, `functions/src/ranking/*.ts`).
- Ranking helper compartilhado:
- `functions/src/ranking/helpers.ts` (máscara LGPD, chave de cliente, agregação mL, bebida favorita, data do dia, código de prêmio).
- Cleanup/Migrations:
- `onDeleteStore` em `functions/src/cleanup/onDeleteStore.ts`.
- `cleanupOldNotifications` remove notificacoes antigas quando `isRead=true` ou `isDismissed=true`, com processamento em lotes (`functions/src/erp/cleanupOldNotifications.ts`).
- migrações em `functions/src/migrations/*.ts`.

## 3) Schema inferido por coleção

### Globais

- `users/{userId}`:
- campos observados: `email:string`, `displayName:string`, `photoURL:string|null`, `role:string`, `franchiseId:string|null`, `storeId:string|null`, `createdAt:Timestamp|FieldValue`, `lastLoginAt:Timestamp|FieldValue`, `updatedAt:Timestamp|FieldValue`, `isActive:boolean`.
- `superadmins/{userId}`:
- `email:string`, `displayName:string`, `status:string`, `createdAt:Timestamp|FieldValue`, `updatedAt:Timestamp|FieldValue`, `revokedAt:Timestamp|FieldValue|null`.
- `invitations/{inviteId}`:
- `email:string`, `role:string`, `franchiseId:string`, `storeId:string`, `token:string`, `status:string`, `expiresAt:Timestamp`, `acceptedAt:Timestamp|null`, `createdAt:Timestamp|FieldValue`, `updatedAt:Timestamp|FieldValue`.
- `settings/{settingId}`:
- uso ativo observado: `default_currency` (`currency:string`, `updatedAt:*`).
- `audit_logs/{logId}` (legado):
- `action:string`, `franchiseId?:string`, `performedBy?:string`, `targetUserId?:string`, `claims?:object`, `actor?:object`, `target?:object`, `timestamp:Timestamp|FieldValue`, `meta?:object`.

### Franquia

- `franchises/{franchiseId}`:
- `name:string`, `ownerId:string`, `plan:string`, `billingStatus:string`, `createdAt:*`, `updatedAt:*`.
- `franchises/{franchiseId}/members/{userId}`:
- `userId:string`, `role:string`, `storeAccess:string[]`, `isActive:boolean`, `joinedAt:*`, `updatedAt:*`.
- `franchises/{franchiseId}/notifications/{notificationId}`:
- `type:string`, `priority:string`, `title:string`, `message:string`, `isRead:boolean`, `isDismissed:boolean`, `dedupeKey:string`, `createdAt:*`, `actionUrl:string`.
- `franchises/{franchiseId}/auditLogs/{logId}`:
- `action:string`, `actor:object`, `target:object`, `timestamp:*`, `metadata:object`.
- `franchises/{franchiseId}/billingEvents/{eventId}`:
- dados de webhook/evento Stripe (payload bruto sanitizado + metadados).
- `franchises/{franchiseId}/metrics/{metricId}` e `financeSummary/{periodId}`:
- agregados numéricos de operação/faturamento.

### Loja (`franchises/{franchiseId}/stores/{storeId}`)

- Documento da loja:
- configuração operacional e comercial (nome, currency, tax, flags de kiosk/hardware, `paymentGatewayConfig`, `attractVideoConfig`, `updatedAt:*`).
- `products/{productId}`:
- `title/name:string`, `price:number`, `stock:number`, `inStock:boolean`, `totalMlAvailable:number`, `updatedAt:*`.
- `orders/{orderId}`:
- `orderNumber:string`, `items:array`, `subtotal:number`, `tax:number`, `total:number`, `currency:string`, `status:string`, `paymentStatus:string`, `dispenseStatus:string`, `timestamp:Timestamp|Date`, `createdAt:*`, `paidAt:*`, `completedAt:*|null`, `customer*`.
- `payments/{paymentId}`:
- `provider:string`, `method:string`, `status:string`, `amount:number`, `currency:string`, `orderId:string`, `referenceId:string`, `providerOrderId:string`, `providerPaymentId:string`, `pix:object`, `customer:object`, `requiresRefund:boolean`, `cancelRequested:boolean`, `cancelRequestedAt:string|Timestamp`, `createdAt:*`, `updatedAt:*`.
- Operação chope/ERP:
- `taps`, `kegs`, `tapAssignments`, `servingSessions`, `wastageEvents`, `maintenanceLogs`, `dailyStats`, `metrics`.
- Ranking/TV:
- `rankingAgg`, `tvConfig/current`, `eventStats/current`, `challenges`, `prizes`.
- Comercial:
- `customers`, `deals`, `calendarItems`, `commercialEvents`, `quotes`.
- Financeiro:
- `finAccounts`, `finCategories`, `finCostCenters`, `finParties`, `finLedger`, `finInvoices`, `finBills`, `finPayments`.
- Drift de schema/tipo observado no código legado:
- enums fora do contrato podem chegar e ser aceitos na leitura (`useFinPayments`, `useFinCategories`, `useLedger`, `useBills`).
- campos monetários podem chegar como `string` e contaminar agregações (`finPayments.amount`, `finLedger.amount`, `finBills.remaining`).

## 4) Triggers/Functions relacionadas

- Exportadas em `functions/src/index.ts`.
- Auth: `onUserCreated`, `setCustomClaims`, `setAdminClaims`, `syncMembershipClaims`, `getClaimsForUser`, `refreshUserToken`.
- Invitations: `sendInvitationEmail`, `acceptInvitation`, `validateInvitationToken`.
- Billing: `stripeWebhook`, `createCheckoutSession`, `createBillingPortalSession`.
- Payments: `createPayment`, `pagbankWebhook`, `cancelPagBankPayment`, `syncPendingPayments`, `onPaymentUpdated`.
- Analytics: `aggregateDailySales`, `aggregateDailySalesHTTP`, `getMetricsAdmin`, `onOrderCreated`, `onOrderUpdated`.
- ERP: `onServingSessionCreated`, `onWastageEventCreated`, `aggregateOperationalDaily`, `checkKegLevels`, `checkMaintenanceOverdue`, `resetTapDailyCounters`, `cleanupOldNotifications`.
- Ranking: `onOrderUpdatedRanking`, `recalculateRanking30min`, `onOrderUpdatedChallenge`, `onOrderUpdatedGoldenServe`, `expirePrizes`, `expireEventMode`, `toggleEventMode`, `recalculateRanking30minNow`.
- Migrations/Cleanup: `consolidatePaymentGatewayConfig`, `rollbackPaymentGatewayConfig`, `unifyStoreSettings`, `migrateDispensersToTaps`, `onDeleteStore`.

## 5) Observações de segurança

- Nenhum segredo sensível deve ser persistido em Firestore (`auth_token`, `private keys`, PAN/CVV).
- Cartão em `createPayment` usa `card.encrypted`; PAN/CVV raw não devem atravessar backend (`functions/src/payments/types.ts`).
- Tokens operacionais de providers devem permanecer em Secrets/Functions config.
- Paths de `superadmins` e `analytics` dependem de regras restritivas em `firestore.rules`; acesso cliente direto deve permanecer bloqueado.

## 6) Conflitos detectados (ver evidências)

- Divergência de status de pedidos entre Kiosk e Admin:
- `docs/archives/AUDIT_REPORT.md#7-incompatibilidades-detectadas`
- Conversão monetária inconsistente em notificação de pagamento (`amount/100`):
- `docs/archives/AUDIT_REPORT.md#7-incompatibilidades-detectadas`
- Path legado de auditoria (`audit_logs`) coexistindo com canônico (`franchises/{f}/auditLogs`):
- `docs/archives/AUDIT_REPORT.md#7-incompatibilidades-detectadas`
- ~~`setAdminClaims` mantém escrita dupla em `audit_logs` + `franchises/{f}/auditLogs`~~ **(✅ FIXED — dual-write removido, apenas path canônico)**:
- `docs/archives/AUDIT_REPORT.md#20-ciclo-contínuo-aprofundamento-de-auditoria-em-admin--functions-2026-02-16`
- ~~Ação de auditoria de claims usa `set_admin_claims` (snake_case) fora do padrão dotted do Admin~~ **(✅ FIXED — alterado para `auth.setClaims`)**:
- `docs/archives/AUDIT_REPORT.md#20-ciclo-contínuo-aprofundamento-de-auditoria-em-admin--functions-2026-02-16`
- Exclusão de franquia no Admin tenta apagar `invitations` como subcoleção local da franquia:
- `docs/archives/AUDIT_REPORT.md#20-ciclo-contínuo-aprofundamento-de-auditoria-em-admin--functions-2026-02-16`
- `AuditPage` do Admin ainda consulta fallback legado `audit_logs`:
- `docs/archives/AUDIT_REPORT.md#21-ciclo-contínuo-execução-ampla--novos-contratos-red-2026-02-16`
- `src/lib/pathResolver.ts` (Kiosk) mantém `GlobalCollection` com `'audit_logs'`:
- `docs/archives/AUDIT_REPORT.md#21-ciclo-contínuo-execução-ampla--novos-contratos-red-2026-02-16`
- Subcoleções não cobertas no cleanup de exclusão de loja:
- `docs/archives/AUDIT_REPORT.md#7-incompatibilidades-detectadas`
- Tipo de data divergente (`string ISO` vs `Timestamp`) em fallback de cancelamento PagBank:
- `docs/archives/AUDIT_REPORT.md#7-incompatibilidades-detectadas`
- ~~Callable de cancelamento PagBank sem autorização por tenant (franchise/store)~~ **(✅ FIXED — `requireAuth` + `requireFranchiseAccess` adicionados)**:
- `docs/archives/AUDIT_REPORT.md#24-ciclo-contínuo---normalização-financeira-admin--autorização-de-cancelamento-2026-02-16`
- Contrato de status de pedidos Kiosk (`paid_pending_dispense`, `dispensing`, `failed_dispense`) nao tratado explicitamente em `functions/src/analytics/aggOrders.ts`:
- `docs/archives/AUDIT_REPORT.md#6-bugs-encontrados-reproducao-real`
- `aggregateDailySales` assume `status='completed'` e `paymentStatus='paid'` quando campos faltam, com risco de inflar receita:
- `docs/archives/AUDIT_REPORT.md#6-bugs-encontrados-reproducao-real`
- Variacao `canceled`/`cancelled` nao harmonizada nos agregadores de analytics:
- `docs/archives/AUDIT_REPORT.md#7-incompatibilidades-detectadas`
- Contrato Kiosk x `firestore.rules` para `orders`:
- Kiosk atualiza `dispenseStatus`, `dispensedAt`, `completedAt` e campos de enriquecimento (`customer*`, `gateway*`, `card*`) em `src/services/salesService.ts`, mas rules de update de `orders` permitem apenas `status`, `paymentStatus`, `cancelledAt`, `refundedAt`, `notes`, `updatedAt`:
- `docs/archives/AUDIT_REPORT.md#14.5-bugs-novos-reproduzidos-alem-dos-anteriores`
- Role operacional do Kiosk (`operator`) não está autorizada nas rules de update de `orders` (apenas `owner/admin`):
- `docs/archives/AUDIT_REPORT.md#14.5-bugs-novos-reproduzidos-alem-dos-anteriores`
- Fallback de cancelamento PagBank no cliente tenta `updateDoc` em `payments`, porém rules de `payments` são `allow write: if false`:
- `docs/archives/AUDIT_REPORT.md#14.5-bugs-novos-reproduzidos-alem-dos-anteriores`
- Cleanup de loja em Functions não usa deleção recursiva, com risco de órfãos em subcoleções aninhadas:
- `docs/archives/AUDIT_REPORT.md#14.5-bugs-novos-reproduzidos-alem-dos-anteriores`
- Admin não cobre `paymentStatus` canônicos `canceled`/`expired` no mapeamento/typing de pedidos:
- `docs/archives/AUDIT_REPORT.md#14.5-bugs-novos-reproduzidos-alem-dos-anteriores`
- Filtro de agenda no Admin trata `startAt` não-`Timestamp` como `new Date()` e pode classificar itens legados como "hoje":
- `docs/archives/AUDIT_REPORT.md#16.4-novos-bugs-reproduzidos-alem-dos-anteriores`
- Sincronização de totais em `CommercialQuotesTab` e `FinanceARTab` executa `syncTotals` logo após `loadLines`, com risco de usar estado stale:
- `docs/archives/AUDIT_REPORT.md#16.4-novos-bugs-reproduzidos-alem-dos-anteriores`
- Normalização de enums no Admin não rejeita valores fora do contrato (`Customer.status`, `FinAccount.type`), permitindo drift de schema:
- `docs/archives/AUDIT_REPORT.md#17.3-novos-bugs-reproduzidos-alem-dos-anteriores`
- Normalização de tipo numérico no Admin não converte `openingBalance` string para número, afetando agregação:
- `docs/archives/AUDIT_REPORT.md#17.3-novos-bugs-reproduzidos-alem-dos-anteriores`


## 7) Conflitos adicionais (ciclo 22)

- Contrato de auditoria no Admin desalinhado entre runtime e typing:
- `admin/src/services/auditService.ts` (90 ações), `admin/src/types/audit.ts` (union/labels incompletos).
- evidência: `docs/archives/AUDIT_REPORT.md#22-ciclo-contínuo---aprofundamento-admin--functions-2026-02-16`

- Mapeamento de atividade no dashboard usando namespace legado (`store.created`, `settings.updated`) e não o namespace canônico (`store.create`, `settings.update`):
- `admin/src/pages/dashboard/DashboardPage.tsx`.
- evidência: `docs/archives/AUDIT_REPORT.md#22-ciclo-contínuo---aprofundamento-admin--functions-2026-02-16`

- Remoção de membro inconsistente (soft-delete vs hard-delete):
- canônico em serviço: `admin/src/services/userService.ts` (`isActive=false`)
- hard-delete direto em telas: `admin/src/pages/team/TeamPage.tsx`, `admin/src/pages/users/UsersPage.tsx`, `admin/src/pages/users/UserDetailPage.tsx`.
- evidência: `docs/archives/AUDIT_REPORT.md#22-ciclo-contínuo---aprofundamento-admin--functions-2026-02-16`

- ~~Cleanup de exclusão de loja em Functions não cobre `inventoryLogs`~~ **(✅ FIXED — `inventoryLogs` adicionado a `STORE_SUBCOLLECTIONS`)**:
- `functions/src/cleanup/onDeleteStore.ts`.
- evidência: `docs/archives/AUDIT_REPORT.md#22-ciclo-contínuo---aprofundamento-admin--functions-2026-02-16`

## 8) Conflitos adicionais (ciclo 23)

- ~~Callable de cancelamento PagBank sem gate de autenticação~~ **(✅ FIXED — `requireAuth(request)` adicionado)**:
- `functions/src/payments/index.ts` (`cancelPagBankPayment`) não valida `context.auth`/tenant antes de atualizar `payments/{paymentId}`.
- evidência: `docs/archives/AUDIT_REPORT.md#23-ciclo-contínuo---aprofundamento-admin--functions--segurança-callables-2026-02-16`

- ~~Cleanup de loja não cobre integralmente subcoleções mapeadas por Admin/Kiosk~~ **(✅ FIXED — `inventoryLogs` e `notifications` adicionados)**:
- ~~faltantes confirmados por contrato cruzado: `inventoryLogs` e `notifications`~~ **(corrigido)**.
- evidência: `docs/archives/AUDIT_REPORT.md#23-ciclo-contínuo---aprofundamento-admin--functions--segurança-callables-2026-02-16`

- Exclusão de entidade pai no Admin sem cascade de subcoleções:
- `useCommercialEvents.deleteEvent` remove apenas `commercialEvents/{eventId}` e deixa `budgetLines/*`.
- `useQuotes.deleteQuote` remove apenas `quotes/{quoteId}` e deixa `lines/*`.
- evidência: `docs/archives/AUDIT_REPORT.md#23-ciclo-contínuo---aprofundamento-admin--functions--segurança-callables-2026-02-16`

## 9) Conflitos adicionais (ciclo 24)

- Normalização de enums/status no financeiro do Admin aceita valores inválidos:
- `useFinPayments`, `useFinCategories`, `useLedger`, `useBills`.
- impacto: filtros e derivados (`in/out`, `active`, `draft`) ficam inconsistentes com contrato tipado.
- evidência: `docs/archives/AUDIT_REPORT.md#24-ciclo-contínuo---normalização-financeira-admin--autorização-de-cancelamento-2026-02-16`

- Coerção numérica ausente em campos monetários legados:
- `finPayments.amount`, `finLedger.amount`, `finBills.remaining` podem ser `string`, gerando totais string (`totalIn`, `totalIncome`, `totalPayable`).
- evidência: `docs/archives/AUDIT_REPORT.md#24-ciclo-contínuo---normalização-financeira-admin--autorização-de-cancelamento-2026-02-16`

- `cancelPagBankPayment` sem guardas explícitas de `requireAuth` + autorização por franquia/loja no handler:
- callable permite marcar `cancelRequested=true` sem validação de tenant.
- evidência: `docs/archives/AUDIT_REPORT.md#24-ciclo-contínuo---normalização-financeira-admin--autorização-de-cancelamento-2026-02-16`

## 10) Conflitos adicionais (ciclo 25)

- Normalização em `useInvoices`, `useQuotes`, `useDeals` e `useParties` segue aceitando enums fora do contrato e tipos monetários string:
- `status` inválido entra sem fallback, `total/remaining/valueEstimate` string contamina agregações.
- evidência: `docs/archives/AUDIT_REPORT.md#25-ciclo-contínuo---expansão-admin--ranking-helpers-2026-02-16`

- `ranking/helpers.ts` e `recalculate30minNow.ts` têm drift de implementação:
- `recalculate30minNow.ts` foi atualizado para reutilizar helper compartilhado (`import './helpers'`), mitigando o drift desta parte.
- evidência: `docs/archives/AUDIT_REPORT.md#25-ciclo-contínuo---expansão-admin--ranking-helpers-2026-02-16`

- Agregação de volume em ranking conta `quantity=0` como `1` (`quantity || 1`):
- afeta `calcTotalMl` e `calcFavoriteDrink`, impactando `rankingAgg.totalMl`, janela `totalMl30min` e favoritismo de bebida.
- evidência: `docs/archives/AUDIT_REPORT.md#25-ciclo-contínuo---expansão-admin--ranking-helpers-2026-02-16`

## 11) Conflitos adicionais (ciclo 26)

- Validação numérica incompleta em `tvEventService`:
- `admin/src/services/tvEventService.ts` aceita payloads não-numéricos por coerção implícita em comparações de faixa (`'abc'`, `'500'`, `'x'`), em pontos como `updateTvConfig`, `setCollectiveGoal` e `createChallenge`.
- evidência: `docs/archives/AUDIT_REPORT.md#263-bugsincompatibilidades-confirmados-neste-ciclo`

- Drift de contrato de apresentação em `formatVolume`:
- `admin/src/utils/formatVolume.ts` passou a retornar compactação com vírgula decimal (`9,1L`) e sufixo curto sem espaço (`1KL`), enquanto suíte de contrato existente ainda valida formato antigo.
- evidência: `docs/archives/AUDIT_REPORT.md#263-bugsincompatibilidades-confirmados-neste-ciclo`

- Migração de telão confirmada para documentos agregados:
- `TvDashboardPage` não consulta mais `orders` diretamente; consumo passa por `rankingAgg/eventStats/challenges/prizes`.
- evidência: `docs/archives/AUDIT_REPORT.md#264-fluxo-real-quem-chama-o-quê-validado-para-os-arquivos-novos`

## 12) Conflitos adicionais (ciclo 27)

- Gate de status insuficiente no trigger de ranking:
- `functions/src/ranking/rankingFunctions.ts` (`onOrderUpdatedRanking`) ainda permite caminho de agregação quando `customerName` aparece sem validação explícita de `after.status` elegível.
- evidência: `docs/archives/AUDIT_REPORT.md#274-bugs-novos-confirmados-com-evidência`

- Autorização incompleta no recálculo manual de ranking:
- `functions/src/ranking/recalculate30minNow.ts` autoriza por role, mas não valida `members/{uid}.isActive`.
- evidência: `docs/archives/AUDIT_REPORT.md#274-bugs-novos-confirmados-com-evidência`

