# Auditoria Arquitetural Forense da Plataforma

## 1. Resumo executivo

O repositório atual implementa com boa maturidade um produto de **self-service de bebidas com pagamento imediato**, composto por:

- app kiosk/tablet em `src/`
- admin web em `admin/src/`
- Cloud Functions em `functions/`
- tipos/contratos compartilhados em `shared/`
- Firebase/Firestore como backbone de dados, segurança e eventos

O sistema **já suporta muito bem**:

- multi-tenant por `franchise -> store`
- catálogo, estoque, torneiras, barris e assignments
- fluxo `pagamento -> order -> dispense -> servingSession -> ERP operacional`
- integração com hardware/ESP32
- monitoramento de devices
- gateways de pagamento e resolução por torneira
- operação administrativa, comercial e financeira básica

O sistema **não suporta estruturalmente hoje**:

- credencial NFC/tag/cartão
- vínculo operacional robusto entre cliente e consumo
- conta aberta/comanda
- ledger de consumo pós-pago
- settlement/fechamento consolidado
- hosted events operacionais com participantes/mesa/grupo
- antifraude específico de pós-pago/NFC
- perfis operacionais formais por loja/dispositivo

Conclusão principal confirmada no código: a arquitetura atual é **payment-first**. O documento `order` nasce como venda imediata paga, o documento `payment` modela tentativa/captura de gateway, e `servingSession` é a melhor aproximação atual de verdade física do consumo.

Direção recomendada: **preservar o fluxo atual como módulo estável de pagamento imediato** e evoluir o produto via:

- capacidades base compartilhadas
- módulos opcionais
- perfis operacionais por loja
- perfis de dispositivo por tablet/superfície

Erro mais perigoso a evitar: **forçar conta aberta/NFC/hosted event dentro de `orders`, `payments` ou `commercialEvents`**. Isso conflita com a responsabilidade real dessas estruturas no repositório atual.

---

## 2. Metodologia da auditoria

### 2.1 Como a auditoria foi conduzida

A auditoria foi conduzida com leitura direta do repositório, priorizando:

- rotas e superfícies principais
- serviços críticos do kiosk
- triggers e callables de Cloud Functions
- tipos compartilhados e resolvedores de path
- regras do Firestore e índices
- evidência relevante em Android/hardware

### 2.2 Áreas analisadas

Foram revisadas, no mínimo, as áreas abaixo:

- `src/`
- `admin/src/`
- `functions/`
- `shared/`
- `android/`
- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `package.json`, `admin/package.json`, `functions/package.json`

### 2.3 Critérios de prioridade

Os arquivos e módulos foram priorizados por impacto arquitetural:

1. fluxo ponta a ponta de venda imediata
2. domínio físico-operacional de dispense
3. camada de pagamentos
4. camada de ERP/financeiro
5. rotas e navegação do admin
6. contratos compartilhados e tenancy
7. segurança e regras de atualização

### 2.4 Como as conclusões foram validadas

As conclusões deste documento foram validadas por evidência explícita em arquivos/funções como:

- `src/components/DrinkQuickCheckoutModal.tsx::finishPaymentFlow`
- `src/services/salesService.ts::recordSaleAndUpdateStock`
- `src/context/ESP32Context.tsx::handleESP32Response`
- `src/services/servingSessionService.ts::persistSession`
- `functions/src/erp/onServingSessionCreated.ts`
- `functions/src/payments/paymentService.ts::createPaymentIntent`
- `functions/src/finance/onOrderPaidLedger.ts`
- `admin/src/App.tsx`
- `admin/src/components/store/StoreSettingsTab.tsx`
- `shared/types/operations.ts`
- `firestore.rules`

### 2.5 Limitações remanescentes

Limitações restantes:

- nem todo componente secundário do admin foi lido linha a linha; a cobertura profunda foi concentrada nos pontos críticos e no mapeamento estrutural das demais áreas
- `dist/`, `build/`, `coverage/` e documentos legados do próprio repositório não foram usados como fonte de verdade
- a análise de Android foi orientada ao que impacta hardware/NFC; não houve inspeção detalhada de toda a árvore nativa fora do que era relevante

---

## 3. Inventário global do repositório

### 3.1 Kiosk app

Baseado em `src/App.tsx`, `src/pages/Shop.tsx`, `src/components/DrinkQuickCheckoutModal.tsx`, `src/context/ESP32Context.tsx` e `src/services/*`.

Responsabilidades confirmadas:

- autenticação e bootstrap da loja/dispositivo
- fluxo público de compra
- checkout imediato
- orquestração de dispense
- persistência offline best-effort
- heartbeat de device
- relay de câmera/terminal

### 3.2 Admin web

Baseado em `admin/src/App.tsx`, `admin/src/config/storeNavConfig.ts`, `admin/src/pages/stores/StoreSubPages.tsx` e tabs/components de store.

Responsabilidades confirmadas:

- gestão de loja, catálogo, operação, CRM, financeiro e devices
- RBAC e navegação por domínio
- monitoramento de taps, servingSessions e dispositivos
- configuração de pagamento, kiosk, atrativo e taps

### 3.3 Cloud Functions

Baseado em `functions/src/payments/*`, `functions/src/erp/*`, `functions/src/finance/*`, `functions/src/ranking/*`, `functions/src/auth/*`.

Responsabilidades confirmadas:

- criação/sincronização/cancelamento de pagamentos
- webhooks PagBank e Mercado Pago
- processamento operacional de `servingSessions`
- ledger financeiro básico
- notificações
- claims e acesso

### 3.4 Shared types/schemas

Baseado em `shared/types/operations.ts`, `shared/types/store.ts`, `shared/types/permissions.ts`, `shared/schemas/store.schema.ts`.

Responsabilidades confirmadas:

- tipos operacionais centrais
- contrato unificado de store/settings
- RBAC unificado
- schema validation de store

### 3.5 Firebase/security/config

Baseado em `firebase.json`, `firestore.rules`, `firestore.indexes.json`.

Responsabilidades confirmadas:

- Functions em `nodejs22`
- Hosting SPA em `dist`
- regras por franquia/loja
- índices para orders, payments, servingSessions, ranking, CRM e financeiro

### 3.6 Pagamentos

Evidência central:

- `functions/src/payments/index.ts`
- `functions/src/payments/paymentService.ts`
- `functions/src/payments/storeConfig.ts`
- `src/services/paymentService.ts`
- `src/types/payments.ts`

### 3.7 ERP operacional

Evidência central:

- `shared/types/operations.ts`
- `src/services/servingSessionService.ts`
- `functions/src/erp/onServingSessionCreated.ts`
- `functions/src/erp/onWastageEventCreated.ts`
- `functions/src/erp/checkKegLevels.ts`

### 3.8 Dispositivos/hardware

Evidência central:

- `src/context/ESP32Context.tsx`
- `src/services/deviceHeartbeatService.ts`
- `src/services/kioskBootstrapService.ts`
- `admin/src/components/store/StoreDeviceList.tsx`
- `admin/src/components/store/DeviceTerminalDialog.tsx`
- `android/app/src/main/AndroidManifest.xml`

### 3.9 Estoque/taps

Evidência central:

- `admin/src/components/store/StoreSettingsTab.tsx`
- `admin/src/components/store/StoreOperationsTab.tsx`
- `shared/types/operations.ts`
- `functions/src/erp/onServingSessionCreated.ts`

### 3.10 ServingSessions

Evidência central:

- `src/services/servingSessionService.ts`
- `shared/types/operations.ts`
- `functions/src/erp/onServingSessionCreated.ts`
- `firestore.rules`

### 3.11 Orders

Evidência central:

- `src/services/salesService.ts`
- `src/components/DrinkQuickCheckoutModal.tsx`
- `admin/src/components/store/StoreOrdersTab.tsx`
- `firestore.rules`

### 3.12 Customers

Evidência central:

- `admin/src/types/commercial.ts`
- `admin/src/hooks/useCustomers.ts`
- `firestore.rules`
- `src/types/sales.ts`

### 3.13 Events

Há dois conceitos atuais no repositório:

- `commercialEvents` de CRM em `admin/src/types/commercial.ts`
- `eventStats/current.eventMode` ligado a ranking/TV/dynamic pricing em `functions/src/ranking/toggleEventMode.ts`

Nenhum dos dois equivale a hosted event operacional com settlement.

### 3.14 Financeiro

Evidência central:

- `functions/src/finance/onOrderPaidLedger.ts`
- `functions/src/finance/onWastageEventLedger.ts`
- `functions/src/finance/onKegStatusChangeLedger.ts`
- `admin/src/lib/pathResolver.ts`
- rotas `finance/*` em `admin/src/App.tsx`

### 3.15 Permissões e tenancy

Evidência central:

- `shared/types/permissions.ts`
- `admin/src/context/PermissionContext.tsx`
- `admin/src/context/AuthContext.tsx`
- `functions/src/payments/paymentService.ts::assertStoreAccess`
- `firestore.rules`

Conclusão confirmada: tenancy por `franchises/{franchiseId}/stores/{storeId}` é madura e já espalhada de forma consistente por kiosk, admin, functions e regras.

---

## 4. Inventário completo de rotas

### 4.1 Admin

| Caminho | Componente/Page | Finalidade | Domínio | Status atual | Reaproveitável |
|---|---|---|---|---|---|
| `/` | `RootRoute` | Landing ou redirect | shell | ativo | sim |
| `/login` | `LoginPage` | login admin | auth | ativo | sim |
| `/register` | `RegisterPage` | cadastro | auth | ativo | sim |
| `/forgot-password` | `ForgotPasswordPage` | reset senha | auth | ativo | sim |
| `/invite`, `/invite/:token` | `InvitePage` | aceitação de convite | auth/team | ativo | sim |
| `/ranking/display/:storeId` | `TvDashboardPage` | ranking público/TV | ranking/evento promocional | ativo | não para hosted event |
| `/dashboard` | `DashboardPage` | visão geral | gestão | ativo | sim |
| `/stores` | `StoresPage` | lista de lojas | gestão | ativo | sim |
| `/stores/new` | `StoreCreatePage` | criação de loja | gestão | ativo | sim |
| `/stores/:storeId` | `StoreLayout` | shell de loja | shell | ativo | sim |
| `/stores/:storeId` | `StoreOverviewPage` | overview da loja | overview | ativo | sim |
| `/stores/:storeId/orders` | `StoreOrdersPage` | pedidos imediatos | operação/vendas | ativo | parcialmente |
| `/stores/:storeId/operations` | `StoreOperationsPage` | operação ao vivo | operação | ativo | sim |
| `/stores/:storeId/kegs` | `StoreKegsPage` | barris | operação | ativo | sim |
| `/stores/:storeId/wastage` | `StoreWastagePage` | perdas | operação | ativo | sim |
| `/stores/:storeId/maintenance` | `StoreMaintenancePage` | manutenção | operação | ativo | sim |
| `/stores/:storeId/products` | `StoreProductsPage` | catálogo | catálogo | ativo | sim |
| `/stores/:storeId/inventory` | `StoreInventoryPage` | inventário | catálogo/estoque | ativo | sim |
| `/stores/:storeId/members` | `StoreMembersPage` | equipe da loja | gestão | ativo | sim |
| `/stores/:storeId/reports` | `StoreReportsPage` | relatórios loja | gestão | ativo | sim |
| `/stores/:storeId/settings` | `StoreSettingsPage` | config da loja | gestão/config | ativo | sim, com expansão |
| `/stores/:storeId/commercial/pipeline` | `CommercialPipelinePage` | pipeline CRM | comercial | ativo | não para operação |
| `/stores/:storeId/commercial/calendar` | `CommercialCalendarPage` | agenda CRM | comercial | ativo | não para operação |
| `/stores/:storeId/commercial/events` | `CommercialEventsPage` | eventos comerciais | comercial | ativo | não para hosted event operacional |
| `/stores/:storeId/commercial/customers` | `CommercialCustomersPage` | cadastro CRM clientes | comercial | ativo | parcialmente |
| `/stores/:storeId/commercial/customers/:customerId` | `CommercialCustomerDetailPage` | detalhe cliente | comercial | ativo | parcialmente |
| `/stores/:storeId/commercial/quotes` | `CommercialQuotesPage` | propostas | comercial | ativo | não para settlement |
| `/stores/:storeId/commercial/activities` | `CommercialActivitiesPage` | atividades CRM | comercial | ativo | não |
| `/stores/:storeId/finance/overview` | `FinanceOverviewPage` | visão financeira | financeiro | ativo | sim |
| `/stores/:storeId/finance/ar` | `FinanceARPage` | contas a receber | financeiro | ativo | potencialmente no pós-pago futuro |
| `/stores/:storeId/finance/ap` | `FinanceAPPage` | contas a pagar | financeiro | ativo | sim |
| `/stores/:storeId/finance/cash` | `FinanceCashPage` | caixa & bancos | financeiro | ativo | sim |
| `/stores/:storeId/finance/payments` | `FinancePaymentsPage` | pagamentos financeiros | financeiro | ativo | parcialmente |
| `/stores/:storeId/finance/reports` | `FinanceReportsPage` | relatórios financeiros | financeiro | ativo | sim |
| `/stores/:storeId/finance/settings` | `FinanceSettingsPage` | contas/categorias | financeiro | ativo | sim |
| `/stores/:storeId/devices` | `StoreDevicesPage` | monitoramento devices | gestão/dispositivos | ativo | sim, com expansão |
| `/team` | `TeamPage` | gestão de usuários | gestão | ativo | sim |
| `/team/:userId` | `UserDetailPage` | detalhe de usuário | gestão | ativo | sim |
| `/reports` | `ReportsPage` | relatórios globais admin | gestão | ativo | sim |
| `/ranking` | `RankingPage` | ranking e modo evento promocional | ranking | ativo | não para hosted event operacional |
| `/forecast` | `DemandForecastPage` | previsão | analytics | ativo | sem impacto direto |
| `/audit` | `AuditPage` | auditoria | auditoria | ativo | sim |
| `/settings` | `SettingsPage` | settings globais admin | gestão | ativo | sim |
| `/profile` | `ProfilePage` | perfil | conta | ativo | sim |
| `/billing` | `BillingPage` | faturamento plataforma | billing | ativo | sem impacto direto |
| `/superadmin/*` | `SuperAdmin*` | gestão plataforma | plataforma | ativo | sem impacto direto |

### 4.2 Kiosk

| Caminho | Page | Finalidade | Fluxo operacional | Suporta perfis alternativos hoje? |
|---|---|---|---|---|
| `/login` | `LoginPage` | login do app | autenticação | não |
| `/invite` | `AcceptInvitePage` | convite | autenticação | não |
| `/device-not-provisioned` | `DeviceNotProvisionedPage` | provisioning de kiosk | setup | parcialmente |
| `/` | `Index` | landing com atalhos | shell simples | não |
| `/admin` | `Admin` | admin legado dentro do kiosk | utilitário/legado | não é a superfície ideal |
| `/shop` | `Shop` | fluxo público de compra | self-service imediato | não, hoje é fortemente single-profile |
| `/store-select` | `StoreSelectPage` | seleção de loja | bootstrap | parcialmente |
| `*` | `NotFound` | fallback | shell | não |

Diagnóstico: o kiosk atual foi desenhado como **superfície pública de pagamento imediato**, não como shell multi-operacional.

---

## 5. Inventário completo de coleções e entidades

### 5.1 Entidades atuais relevantes

| Coleção/entidade | Localização/path | Finalidade | Campos importantes observados | Relações | Papel no fluxo atual | Problemas atuais | Adequação a novos cenários |
|---|---|---|---|---|---|---|---|
| `stores` doc | `franchises/{fId}/stores/{sId}` | store settings e config | `paymentGatewayConfig`, `kioskEnabled`, `attract*`, `taps[]`, `dispensers[]` | pai de quase todo domínio | bootstrap e configuração | mistura config atual com legados (`dispensers[]`) | boa para capabilities/perfis |
| `orders` | `.../orders/{orderId}` | venda imediata | `status`, `paymentStatus`, `dispenseStatus`, `items`, `paymentMethod`, `orderNumber`, `customerName` | pagamento, serving session, ranking, admin | núcleo da venda atual | payment-first, updates restritos, sem vida de conta | ruim para conta aberta |
| `payments` | `.../payments/{paymentId}` | registro de gateway | `provider`, `method`, `status`, `orderId`, `provider*`, `pix`, `channel` | orderId, webhooks | captura/tentativa de pagamento | server-owned, sem noção de consumo | ruim para NFC/postpaid |
| `products` | `.../products/{productId}` | catálogo/estoque | `title`, `price`, `isDrink`, `stock`, `totalMlAvailable` | orders, inventory, taps | seleção e baixa de estoque | mistura produto e disponibilidade | boa como capacidade base |
| `inventoryLogs` | `.../inventoryLogs/{id}` | movimentação de estoque | não auditado em detalhe | products | rastreabilidade estoque | não central ao pós-pago | reaproveitável |
| `devices` | `.../devices/{deviceId}` | heartbeat e estado do tablet | `lastSeen`, `selectedTapId`, `plugpagDeviceId`, `location`, `esp32` | câmera/terminal remoto | observabilidade dispositivo | sem perfil operacional formal | excelente para device profile |
| `hardware/status` | `.../hardware/status` | status agregado hardware | `esp32Connected`, `esp32Ip`, etc. | StoreSettingsTab | monitoramento técnico | não substitui `devices` | reaproveitável |
| `taps` | `.../taps/{tapId}` | estado operacional de torneira | `currentKegId`, `todayMlDispensed`, `todaySessions`, `processedEvents` | kegs, assignments, servingSessions | ERP operacional | não modela autorização | excelente base |
| `kegs` | `.../kegs/{kegId}` | barril | `remainingMl`, `status`, `tapIds`, `processedEvents` | taps, assignments, servingSessions | estoque físico | foco puramente físico | excelente base |
| `tapAssignments` | `.../tapAssignments/{assignmentId}` | histórico tap↔keg | `status`, `totalMlDispensed`, `totalSessions` | taps, kegs | rastreabilidade operacional | sem vínculo financeiro | excelente base |
| `servingSessions` | `.../servingSessions/{eventId}` | evento físico imutável | `orderId`, `tapId`, `kegId`, `actualMl`, `targetMl`, `status` | taps, kegs, orders, ERP | verdade física do dispense | referencia order pago, não conta | melhor base para consumo físico |
| `wastageEvents` | `.../wastageEvents/{id}` | perdas | `mlLost`, `type`, `source` | taps, kegs, ledger | perdas/overpour | sem link com settlement | boa base |
| `maintenanceLogs` | `.../maintenanceLogs/{id}` | manutenção | `type`, `status`, `scheduledAt`, `performedAt` | taps/kegs | operação | sem impacto direto | boa base |
| `systemLogs` | `.../systemLogs/{logId}` | logs do kiosk/sistema | texto/eventos operacionais | devices, kiosk | diagnóstico | sem modelagem de reconciliação | reaproveitável |
| `notifications` | `franchises/{fId}/notifications` e store-level | alertas | `priority`, `entityRef`, `actionUrl` | functions/admin | monitoramento | não é trilha contábil | reaproveitável |
| `customers` | `.../customers/{customerId}` | CRM de clientes | `type`, `name`, `doc`, `phones`, `emails`, `tags`, `status` | deals, events, quotes | comercial | não é identidade operacional forte | parcialmente reutilizável |
| `deals` | `.../deals/{dealId}` | pipeline CRM | `stage`, `valueEstimate`, `customerId` | customers, activities | vendas B2B/eventos | sem consumo/settlement | não |
| `calendarItems` | `.../calendarItems/{id}` | agenda CRM | `type`, `relatedType`, `relatedId` | deals/customers/events | comercial | não operacional | não |
| `commercialEvents` | `.../commercialEvents/{eventId}` | evento comercial/CRM | `customerId`, `pricingModel`, `attendeesEstimate`, `status` | customers, quotes, budgetLines | comercial | não modela participante, tag, consumo, settlement | não deve ser reutilizado como hosted event |
| `quotes` | `.../quotes/{quoteId}` | proposta/orçamento comercial | `customerId`, `eventId`, `total` | commercialEvents | comercial | não operacional | não |
| `finAccounts` | `.../finAccounts/{id}` | contas financeiras | tipo/nome/status | finLedger | financeiro | sem acoplamento com open tab | boa base |
| `finCategories` | `.../finCategories/{id}` | categorias financeiras | `direction`, `status` | finLedger | financeiro | boa base | boa base |
| `finLedger` | `.../finLedger/{id}` | lançamentos financeiros | `sourceType`, `sourceId`, `amount`, `method` | orders, wastage, kegs | financeiro | hoje não representa settlement de conta/evento | boa base para integração |
| `finInvoices` | `.../finInvoices/{id}` | faturas | status/linhas | finPayments | financeiro | potencial útil no pós-pago | parcial |
| `finBills` | `.../finBills/{id}` | contas a pagar | financeiro | financeiro | sem impacto direto | parcial |
| `finPayments` | `.../finPayments/{id}` | pagamentos financeiros | imutável | invoices/bills | financeiro | diferente de gateway `payments` | útil em settlement |
| `eventStats/current` | `.../eventStats/current` | ranking/TV/event mode | `eventMode`, `totalMl`, `milestones` | ranking | evento promocional | leitura autenticada ampla; não adequado para cobrança | não |
| `rankingAgg` | `.../rankingAgg/{customerId}` | ranking agregado | `totalMl`, `totalSpent`, `favoriteDrink` | orders | gamificação/TV | não operacional | não |
| `auditLogs` | `franchises/{fId}/auditLogs/{id}` | auditoria franquia | ação/ator/entidade | admin/functions | trilha administrativa | não cobre semântica financeira nova sozinho | reaproveitável |

### 5.2 Evidências críticas sobre adequação

- `orders` têm updates fortemente restritos em `firestore.rules`; a lista de campos permitidos confirma foco em status, enrichments e gateway metadata, não lifecycle de conta aberta.
- `payments` têm `allow write: if false` em `firestore.rules`; são claramente registros server-owned de gateway.
- `servingSessions` são imutáveis por contrato em `shared/types/operations.ts` e `firestore.rules`.
- `customers` e `commercialEvents` vivem sob o bloco “Comercial (CRM)” do admin e das regras, reforçando seu papel comercial e não operacional.
- `src/types/sales.ts::OrderCustomerData` documenta explicitamente que os dados do cliente em `orders` são usados para ranking/analytics e rastreamento de gateway, não como conta operacional forte.

---

## 6. Inventário completo de Cloud Functions

### 6.1 Funções centrais ao fluxo atual e à evolução

| Function | Tipo/gatilho | Responsabilidade | Inputs/outputs principais | Coleções impactadas | Dependências | Risco / reaproveitamento |
|---|---|---|---|---|---|---|
| `createPayment` | `onCall` | criar pagamento | payload de itens/amount/orderId/method | `payments` | `paymentService.ts`, store config | altamente reaproveitável para imediato; não para open tab |
| `pagbankWebhook` | `onRequest` | webhook PagBank | request provider | `payments` | provider PagBank | reaproveitável |
| `mercadopagoWebhook` | `onRequest` | webhook Mercado Pago | request provider | `payments` | provider MP | reaproveitável |
| `cancelPagBankPayment` | `onCall` | cancelar PagBank | paymentId | `payments` | gateway | reaproveitável |
| `cancelMercadoPagoPayment` | `onCall` | cancelar MP | paymentId | `payments` | gateway | reaproveitável |
| `checkMercadoPagoPaymentStatus` | `onCall` | consultar status MP | payment/order info | `payments` | gateway | reaproveitável |
| `syncPendingPayments` | schedule | sincronizar pendentes | none | `payments` | gateway | reaproveitável |
| `onPaymentUpdated` | `onDocumentUpdated` | criar notificações de falha/cancelamento/reembolso | status changes | `payments`, `notifications` | logger/db | reaproveitável |
| `onServingSessionCreated` | `onDocumentCreated` | ERP operacional pós-dispense | `servingSession` | `kegs`, `taps`, `tapAssignments`, `wastageEvents`, `notifications` | Firestore tx/batch | peça central para qualquer evolução |
| `onWastageEventCreated` | `onDocumentCreated` | impactos operacionais de perda | `wastageEvents` | operacional | ERP | reaproveitável |
| `onOrderPaidLedger` | `onDocumentUpdated` | gerar ledger financeiro a partir de order pago | `orders` update | `finLedger`, `finAccounts`, `finCategories` | financeiro | reaproveitamento parcial; hoje tem incompatibilidade com fluxo atual |
| `onKegStatusChangeLedger` | `onDocumentUpdated` | ledger por mudança de barril | `kegs` | `finLedger` | financeiro | reaproveitável |
| `onWastageEventLedger` | `onDocumentCreated` | ledger de perdas | `wastageEvents` | `finLedger` | financeiro | reaproveitável |
| `toggleEventMode` | `onCall` | ativar “modo evento” promocional | storeId/franchiseId/duration | `eventStats/current` | ranking | não reutilizar para hosted event operacional |
| `onOrderUpdatedRanking` | `onDocumentUpdated` | ranking quando order recebe `customerName` | `orders` | `rankingAgg`, `eventStats`, `prizes` | ranking helpers | evidencia customer enrichment, não identidade operacional |
| `aggregateOperationalDaily` | schedule | agregações operacionais | operacional | métricas | ERP | reaproveitável |
| `checkKegLevels` | schedule | alertas de barril baixo | kegs | notifications | ERP | reaproveitável |
| `checkMaintenanceOverdue` | schedule | manutenção vencida | maintenance | notifications | ERP | reaproveitável |
| `checkFinanceOverdue` | schedule | financeiro vencido | fin docs | notifications | financeiro | talvez útil no pós-pago depois |
| `syncMembershipClaims` / claims | `onCall` | claims/RBAC | auth context | users/members | auth | reaproveitável |

### 6.2 Observações críticas

1. `functions/src/payments/paymentService.ts::createPaymentIntent` faz verificação server-side de `amount` contra `items`, resolve gateway e terminal por tap e usa deduplicação transacional por `orderId`. Isso é uma base forte para pagamento imediato.

2. `functions/src/payments/onPaymentUpdated.ts` só gera notificações e não modela settlement, tab ou consumo identificado.

3. `functions/src/finance/onOrderPaidLedger.ts` tem uma incompatibilidade arquitetural relevante com o fluxo atual:

- o trigger é `onDocumentUpdated`
- ele só cria ledger quando `paymentStatus` transita de não-pago para pago
- `src/services/salesService.ts::recordSaleAndUpdateStock` cria o `order` já com `paymentStatus: 'paid'`

Isso sugere risco real de o lançamento financeiro não nascer do create normal do kiosk. Mesmo que exista outro fluxo compensatório, este trigger isoladamente já não encaixa de forma limpa com o contrato atual do kiosk.

4. `functions/src/erp/onServingSessionCreated.ts` é a peça mais sólida da arquitetura operacional atual e deve continuar central na evolução.

---

## 7. Mapa de dependência entre módulos

### 7.1 Dependências principais

- **Kiosk UI** depende de:
  - `src/context/ESP32Context.tsx`
  - `src/services/salesService.ts`
  - `src/services/paymentService.ts`
  - `src/services/servingSessionService.ts`
  - `src/services/kioskBootstrapService.ts`
  - `src/services/deviceHeartbeatService.ts`
  - `shared/types/store.ts`
  - coleções `orders`, `products`, `payments`, `servingSessions`, `devices`

- **Admin UI** depende de:
  - `admin/src/App.tsx`
  - `admin/src/components/store/*`
  - `admin/src/lib/pathResolver.ts`
  - `admin/src/context/*`
  - coleções store-level e franchise-level

- **Cloud Functions** dependem de:
  - paths canônicos `franchises/{franchiseId}/stores/{storeId}`
  - coleções `payments`, `orders`, `servingSessions`, `kegs`, `taps`, `tapAssignments`, `fin*`, `eventStats`, `rankingAgg`

- **Hardware/ESP32** depende de:
  - `ESP32Context`
  - serviços de comunicação BLE/USB/Wi-Fi
  - relay Firestore de devices/terminal/câmera

### 7.2 Pontos de alto acoplamento

- `DrinkQuickCheckoutModal -> salesService -> ESP32Context -> servingSessionService -> onServingSessionCreated`
- `StoreSettingsTab` concentra configuração de gateway, kiosk, taps e compatibilidade legada
- `orders` alimentam admin, ranking e parcialmente financeiro

### 7.3 Gargalos e fragilidades

- acoplamento semântico excessivo em `orders`
- ligação indireta e frágil entre `orders` e `finLedger`
- ausência de domínio próprio para autorização/consumo/settlement
- kiosk público atual não possui shell pronta para múltiplos modos
- `commercialEvents` e `eventStats.eventMode` podem induzir reutilização errada

### 7.4 Áreas boas para extensão

- `shared/types/store.ts` e `StoreSettingsTab` para capabilities e perfis
- `devices/{deviceId}` e `kioskBootstrapService` para perfil de dispositivo
- `servingSessions` e `onServingSessionCreated` como camada física comum
- módulos financeiros `fin*` como destino de settlement

---

## 8. Auditoria arquivo por arquivo

### 8.1 `src/pages/Shop.tsx`

- Responsabilidade real: superfície pública principal do kiosk.
- Papel no fluxo: catálogo, pesquisa, carrinho, abertura do checkout rápido de bebida, pickup screen, attract mode, device heartbeat.
- Dependências diretas: `DrinkQuickCheckoutModal`, `DrinkPickupScreen`, `AttractScreen`, `useESP32`, `deviceHeartbeatService`, `cameraStreamService`, `terminalRelayService`.
- Valor arquitetural: excelente base para perfil `public_checkout_kiosk`.
- Limitações: a página pressupõe UX pública de compra imediata; não existe shell de identificação/autorização.
- Risco de adaptação: alto se tentar misturar imediato, conta aberta e evento na mesma home.
- Reaproveitamento: alto como catálogo/base visual; baixo como shell multi-operacional.
- Recomendação: preservar como perfil específico de device, não como UI universal.

### 8.2 `src/components/DrinkQuickCheckoutModal.tsx`

- Responsabilidade real: orquestra o checkout de bebida com tamanho/quantidade/pagamento/dispense.
- Papel no fluxo: concentra decisão de gateway, cancelamentos, recovery e `finishPaymentFlow`.
- Dependências diretas: `salesService`, `paymentService`, `ESP32Context`, recovery local, enrichments.
- Valor arquitetural: hoje é o coração do fluxo de receita imediata.
- Limitações:
  - mistura UI, pagamento, persistência de venda e disparo físico
  - fortemente orientado a “pagou agora”
- Risco de adaptação: altíssimo para comanda/NFC se for “esticado”.
- Reaproveitamento: médio; lógica visual e parte do catálogo/tamanho podem ser mantidos.
- Recomendação: isolar `ImmediateCheckout` daqui, e não usar este componente como base do pós-pago.

### 8.3 `src/services/salesService.ts`

- Responsabilidade real: persistência da venda imediata e baixa de estoque.
- Papel no fluxo: cria `orders` e atualiza produtos em transação.
- Evidência crítica: `recordSaleAndUpdateStock` grava `status: 'paid_pending_dispense'`, `paymentStatus: 'paid'`, `dispenseStatus: 'pending'`.
- Valor arquitetural: muito bom para o fluxo atual.
- Limitações:
  - sem noção de conta aberta
  - offline best-effort adequado para venda imediata, perigoso para pós-pago
- Risco de adaptação: alto se tentar transformá-lo em ledger universal.
- Reaproveitamento: alto para `ImmediateCheckout`; baixo para `OpenAccounts`.
- Recomendação: manter como serviço de venda imediata e criar um domínio separado para consumo identificado.

### 8.4 `src/context/ESP32Context.tsx`

- Responsabilidade real: orquestra conexão, dispense, reconexão, timeouts, persistência da sessão física e atualização do pedido.
- Papel no fluxo: ponte crítica entre o software e o evento material de dispense.
- Evidência crítica:
  - ao receber `completed/error`, chama `persistSession(...)`
  - depois atualiza order com `dispensed/failed_dispense`
  - persiste falhas localmente para reconciliação
- Valor arquitetural: altíssimo.
- Limitações: assume `orderId` como referência operacional do dispense.
- Risco de adaptação: médio; precisa passar a aceitar também `authorizationId` ou `accountContext`, mas sem perder `orderId` no modo imediato.
- Reaproveitamento: muito alto.
- Recomendação: manter como executor físico comum; a mudança deve estar antes e depois dele, não dentro do controle físico principal.

### 8.5 `src/services/servingSessionService.ts`

- Responsabilidade real: persistir `servingSessions` imutáveis com idempotência.
- Papel no fluxo: fixar a verdade física por `eventId`.
- Valor arquitetural: altíssimo.
- Limitações: o `eventId` atual depende de `orderId`; no futuro precisará aceitar outro identificador de operação/authorization.
- Risco de adaptação: baixo a médio.
- Reaproveitamento: muito alto.
- Recomendação: manter `servingSessions` como evento físico base; introduzir novo vínculo lógico/financeiro ao redor dela.

### 8.6 `src/services/deviceHeartbeatService.ts`

- Responsabilidade real: registrar `devices/{deviceId}` com heartbeat, GPS, selected tap e metadados.
- Papel no fluxo: observabilidade do device.
- Valor arquitetural: muito bom para device profiles futuros.
- Limitações: não há ainda `deviceProfile`, `operationalProfileOverride` ou capabilities por dispositivo.
- Risco de adaptação: baixo.
- Reaproveitamento: muito alto.
- Recomendação: expandir esta entidade em vez de inventar outro repositório de devices.

### 8.7 `src/services/kioskBootstrapService.ts`

- Responsabilidade real: armazenar bootstrap mínimo do kiosk.
- Papel no fluxo: recovery local de store/franchise e flags de kiosk/attract.
- Valor arquitetural: bom ponto de extensão para device bootstrap.
- Limitações: só carrega dados mínimos; não traz perfil operacional nem capacidades.
- Risco de adaptação: baixo.
- Reaproveitamento: alto.
- Recomendação: estender para `deviceProfile`, não para carregar toda a política operacional offline.

### 8.8 `admin/src/App.tsx`

- Responsabilidade real: mapa mestre de rotas do admin.
- Valor arquitetural: alto; prova que o admin já tem organização por domínios.
- Limitações: não existem rotas de credenciais, contas abertas, hosted events operacionais ou settlements.
- Risco de adaptação: baixo.
- Reaproveitamento: muito alto.
- Recomendação: adicionar módulos novos respeitando a taxonomia atual, em vez de criar novo admin paralelo.

### 8.9 `admin/src/config/storeNavConfig.ts`

- Responsabilidade real: agrupar navegação lateral em `operação`, `catálogo`, `gestão`, `comercial`, `financeiro`.
- Valor arquitetural: alto para organizar novos módulos sem poluir UX.
- Limitações: hoje `operação` não contempla contas/credenciais/eventos operacionais.
- Risco de adaptação: baixo.
- Reaproveitamento: alto.
- Recomendação: encaixar novos módulos nas seções certas e evitar toggles soltos.

### 8.10 `admin/src/components/store/StoreSettingsTab.tsx`

- Responsabilidade real: configuração da loja, gateway, kiosk e taps, com dual-write `taps[]` -> `dispensers[]`.
- Valor arquitetural: altíssimo para governar capabilities e perfil operacional.
- Limitações:
  - já é uma tela muito carregada
  - ainda não há conceito de capabilities/perfil/device profile
- Risco de adaptação: médio por risco de UX confusa.
- Reaproveitamento: alto, desde que a expansão seja hierárquica.
- Recomendação: usar esta tela para capabilities + perfil da loja; não colocar aqui gestão operacional do dia a dia.

### 8.11 `admin/src/components/store/StoreOrdersTab.tsx`

- Responsabilidade real: listar pedidos imediatos e permitir reprint/cancel/refund.
- Valor arquitetural: bom para imediatos.
- Limitações: opera sobre `orders` com estados `paid_pending_dispense`, `dispensing`, `completed`, `cancelled`.
- Risco de adaptação: alto se virar tela de contas abertas.
- Reaproveitamento: parcial.
- Recomendação: manter como “Pedidos Imediatos”.

### 8.12 `admin/src/components/store/StoreOperationsTab.tsx`

- Responsabilidade real: monitorar taps, kegs e últimas `servingSessions`.
- Valor arquitetural: altíssimo para operação física.
- Limitações: sem extrato financeiro por conta/evento.
- Risco de adaptação: baixo se mantida como painel físico-operacional.
- Reaproveitamento: muito alto.
- Recomendação: não poluir com fechamento/settlement; pode ganhar filtros por account/event apenas como leitura contextual futura.

### 8.13 `admin/src/components/store/StoreDeviceList.tsx`

- Responsabilidade real: listar devices e abrir câmera/terminal remoto.
- Valor arquitetural: alto.
- Limitações: monitora, mas não configura perfil operacional do device.
- Risco de adaptação: baixo.
- Reaproveitamento: muito alto.
- Recomendação: expandir com `deviceProfile`, status de provisioning e capabilities do device.

### 8.14 `admin/src/components/store/DeviceTerminalDialog.tsx`

- Responsabilidade real: console remoto para ESP32 via Firestore relay.
- Valor arquitetural: alto para suporte e operação.
- Limitações: técnico; não é superfície de negócio.
- Risco de adaptação: baixo.
- Reaproveitamento: alto.
- Recomendação: manter separado de qualquer fluxo de caixa/conta.

### 8.15 `admin/src/components/store/commercial/CommercialEventsTab.tsx`

- Responsabilidade real: CRUD de eventos comerciais e orçamento CRM.
- Evidência crítica: pode acionar `toggleEventMode` no kiosk, mas isso ativa `eventStats/current.eventMode`, não um evento operacional faturável.
- Valor arquitetural: bom para CRM/eventos comerciais.
- Limitações: não há participantes, tag, consumo real, settlement ou host.
- Risco de adaptação: altíssimo se reutilizado como hosted event operacional.
- Reaproveitamento: apenas referencial/comercial.
- Recomendação: hosted event deve ser módulo novo; pode opcionalmente referenciar `commercialEventId`.

### 8.16 `functions/src/payments/paymentService.ts`

- Responsabilidade real: valida, deduplica e cria pagamentos no gateway.
- Valor arquitetural: muito alto para imediato.
- Evidência crítica:
  - valida `amount` contra `items`
  - resolve terminal por tap
  - usa idempotência por `orderId`
- Limitações: supõe pagamento como origem da autorização.
- Risco de adaptação: alto se tentar usá-lo como motor de autorização NFC.
- Reaproveitamento: alto para checkout imediato e settlement final; baixo para autorização de consumo.

### 8.17 `functions/src/erp/onServingSessionCreated.ts`

- Responsabilidade real: aplicar efeitos operacionais do evento físico.
- Valor arquitetural: central.
- Limitações: hoje não gera `ConsumptionEntry` nem vínculo financeiro pós-pago.
- Risco de adaptação: baixo a médio.
- Reaproveitamento: muito alto.
- Recomendação: mantê-lo como processador operacional e adicionar novo trigger/processo para o ledger de consumo.

### 8.18 `functions/src/finance/onOrderPaidLedger.ts`

- Responsabilidade real: criar `finLedger` a partir de `orders` pagos.
- Limitação crítica: depende de transição de `paymentStatus`; isso conflita com `salesService`.
- Valor arquitetural: parcial.
- Risco de adaptação: alto.
- Reaproveitamento: parcial; serve como referência para integração com `finLedger`, não como desenho final do pós-pago.
- Recomendação: settlement novo deve escrever `finLedger` de forma explícita e não depender desse mesmo padrão.

### 8.19 `shared/types/operations.ts`

- Responsabilidade real: contrato operacional imutável/mutável do ERP de chope.
- Valor arquitetural: altíssimo.
- Limitações: não tem entidade de autorização/credencial/conta.
- Risco de adaptação: baixo.
- Reaproveitamento: muito alto.

### 8.20 `shared/types/store.ts`

- Responsabilidade real: contrato unificado de store/gateway/tap config.
- Valor arquitetural: altíssimo.
- Limitações: não modela capabilities, perfis operacionais, device profiles ou políticas de risco.
- Risco de adaptação: baixo.
- Reaproveitamento: muito alto.

### 8.21 `firestore.rules`

- Responsabilidade real: contrato de mutabilidade/autorização dos dados.
- Valor arquitetural: altíssimo.
- Evidências críticas:
  - `payments` server-owned
  - `servingSessions` imutáveis
  - `orders` com updates restritos
  - `eventStats` e `rankingAgg` expostos a authenticated/anonymous flows específicos
- Risco de adaptação: médio; qualquer novo domínio exige modelagem explícita de write paths e privilégios.
- Reaproveitamento: total como base, mas precisa ser expandido.

---

## 9. Fluxo ponta a ponta atual

### 9.1 Pagamento imediato

Fluxo confirmado:

1. usuário escolhe produto/tamanho em `src/pages/Shop.tsx`
2. `DrinkQuickCheckoutModal` seleciona gateway e inicia pagamento
3. gateway/Cloud Function cria `payments` por `createPayment`
4. após aprovação, `finishPaymentFlow(orderNumber)` executa:
   - `salesService.recordSaleAndUpdateStock(...)`
   - `esp32ReleaseDrink(...)`
5. `recordSaleAndUpdateStock(...)` cria `orders/{orderNumber}` já com:
   - `status: paid_pending_dispense`
   - `paymentStatus: paid`
   - `dispenseStatus: pending`
6. `ESP32Context` atualiza status do pedido durante o fluxo físico
7. ao completar/errar, `persistSession(...)` grava `servingSessions/{eventId}`
8. `onServingSessionCreated` debita barril, atualiza tap/assignment e gera wastage se necessário

### 9.2 Fluxo físico

O evento material nasce em:

- `ESP32Context` ao processar resposta `completed/error`
- `servingSessionService.persistSession(...)`

Invariantes confirmadas:

- `servingSessions` são imutáveis
- `eventId` é determinístico
- `onServingSessionCreated` usa idempotência em `kegs.processedEvents` e `taps.processedEvents`

Em erro/retry:

- `ESP32Context` persiste falha localmente
- o kiosk tenta recovery e retry de dispense
- `servingSession` pode ser enfileirada offline via `enqueueSync`

### 9.3 Fluxo financeiro

O financeiro atual está fragmentado em duas camadas:

- gateway/payment documents em `payments`
- financeiro interno em `finLedger`, `finInvoices`, `finBills`, `finPayments`

Lacuna confirmada:

- não há domínio intermediário de consumo faturável
- não há settlement
- o link `orders -> finLedger` atual é frágil

### 9.4 Fluxo administrativo

O admin opera hoje em eixos bem definidos:

- operação física: `operations`, `kegs`, `wastage`, `maintenance`
- vendas imediatas: `orders`
- catálogo/estoque: `products`, `inventory`
- comercial: `customers`, `commercialEvents`, `quotes`, `pipeline`
- financeiro: `finance/*`
- devices: `devices`

Essa organização é uma boa base para crescer, desde que novos domínios não sejam enfiados nas áreas erradas.

---

## 10. Comparação entre arquitetura atual e arquitetura desejada

| Conceito desejado | O que existe hoje | O que falta | Adaptar ou criar novo | Risco de forçar estrutura errada |
|---|---|---|---|---|
| Credencial NFC | inexistente; `android/app/src/main/AndroidManifest.xml` não declara `android.permission.NFC` e o runtime atual usa BLE/USB sem plugin NFC no `package.json` | leitura NFC, storage, bloqueio, vínculo e UI | criar novo | crítico |
| Vínculo credencial-cliente | apenas `customerName`/`customer*` em `orders` e CRM `customers` | identidade operacional forte | criar novo domínio, talvez referenciando `customers` | alto |
| Histórico de atribuição | inexistente | troca/bloqueio/reemissão de tag | criar novo | alto |
| Conta aberta | inexistente | lifecycle de conta, status, limite, owner | criar novo | crítico |
| Ledger de consumo | inexistente; físico em `servingSessions` | consumo cobrável por conta/evento | criar novo | crítico |
| Settlement | inexistente | fechamento, pagamento final, conciliação | criar novo | crítico |
| Evento privado operacional | não existe; só `commercialEvents` e `eventMode` promocional | host, convidados, tags, cobrança | criar novo | crítico |
| Participante/grupo/mesa | inexistente | participante operacional | criar novo | alto |
| Limites de risco | inexistente | crédito, volume, caução, offline | criar novo | alto |
| Antifraude | apenas controles de dispense e gateway | PIN, bloqueio, duplicidade, inadimplência | criar novo + políticas | alto |
| Perfil operacional por loja | inexistente formalmente; só `kioskEnabled` | `immediate_self_service`, `bar_tab`, `hosted_event` | adaptar store settings | médio |
| Perfil de dispositivo | inexistente formalmente; há `devices` e bootstrap | perfis por tablet/superfície | adaptar `devices` + bootstrap | médio |
| Fluxo híbrido | não formalizado | composição controlada por loja/device | adaptar capabilities + perfis | alto se feito como toggle livre |

---

## 11. Incompatibilidades, inconformidades e riscos

### 11.1 Crítico

- Tratar `orders` como conta aberta. Conflita com o contrato payment-first e com `firestore.rules`.
- Tratar NFC como pagamento. O domínio atual de `payments` é provider-centric, não identity-centric.
- Reutilizar `commercialEvents` como hosted event operacional. O módulo atual é CRM/orçamento, não consumo/liquidação.
- Reutilizar `eventStats/current.eventMode` para hosted event. Esse documento é de ranking/event mode promocional.

### 11.2 Alto

- Misturar consumo físico e cobrança no mesmo documento `order`.
- Criar home única no kiosk público com múltiplos modos misturados.
- Permitir pós-pago offline amplo com a infraestrutura atual.
- Não criar reconciliação explícita entre `servingSessions`, ledger de consumo e settlement.
- Assumir que `customers` CRM já resolvem identidade operacional.

### 11.3 Médio

- Colocar gestão de contas/credenciais dentro de `StoreSettingsTab`; isso degradaria a UX.
- Duplicar lógica de dispense entre modo imediato e modo conta aberta.
- Centralizar tudo no admin sem pensar em superfície de caixa/atendente.

### 11.4 Baixo

- Ajustes em path resolver, índices e regras para novos domínios; são trabalhosos, mas lineares.

---

## 12. Organização ideal do produto

### 12.1 Capacidades base

Capacidades que já existem e devem continuar compartilhadas:

- `Catalog`
- `Inventory`
- `DispenseExecution`
- `OperationalLedger` físico (`servingSessions`, `taps`, `kegs`, `assignments`, `wastage`)
- `Devices`
- `Identity & Access`
- `Audit & Monitoring`

### 12.2 Módulos opcionais

Módulos recomendados, compatíveis com o código atual:

- `ImmediateCheckout`
- `OperationalCustomers`
- `Credentials`
- `OpenAccounts`
- `CashierSettlement`
- `HostedEvents`
- `RiskPolicies`

### 12.3 Perfis operacionais

Perfis de loja recomendados:

- `immediate_self_service`
- `bar_tab`
- `hosted_event`

`hybrid` não deve ser perfil primário isolado. Deve ser uma composição controlada de módulos + perfis de dispositivo.

### 12.4 Perfis de dispositivo

Perfis de device recomendados:

- `public_checkout_kiosk`
- `credential_kiosk`
- `event_guest_kiosk`
- `attendant_station`
- `ops_monitor`

### 12.5 Por que isso encaixa melhor no código atual

Porque o código já separa bem:

- configuração de loja
- operação física
- CRM
- financeiro
- devices

Adicionar apenas “novas telas” sem esta estrutura criaria ambiguidade de domínio e UX confusa.

---

## 13. Organização ideal da UI

### 13.1 Admin

#### Onde configurar capabilities

Recomendação:

- continuar em `/stores/:storeId/settings`
- criar subseção clara de `Capabilities`

Campos sugeridos no store doc:

- `enabledModules.immediateCheckout`
- `enabledModules.credentials`
- `enabledModules.openAccounts`
- `enabledModules.hostedEvents`
- `enabledModules.cashierSettlement`
- `enabledModules.riskPolicies`

#### Onde configurar perfil operacional da loja

Também em `/stores/:storeId/settings`, em seção separada de `Operational Profile`.

Campo sugerido:

- `operationalProfile: 'immediate_self_service' | 'bar_tab' | 'hosted_event'`

#### Onde configurar perfil do device

Em `/stores/:storeId/devices`, porque:

- devices já existem como domínio
- o admin já monitora tablets nesse módulo
- `deviceHeartbeatService` já persiste doc por device

Campo sugerido em `devices/{deviceId}`:

- `deviceProfile`
- `deviceCapabilitiesOverride`
- `isProvisioned`

#### Onde cadastrar clientes

Curto prazo:

- manter em `Comercial > Clientes`
- adicionar no detalhe do cliente um bloco `Operacional`

Motivo: o cadastro `customers` já existe e é store-level.

Médio prazo:

- se CRM e identidade operacional divergirem demais, criar `Operação > Clientes Operacionais`

#### Onde emitir/gerir credenciais NFC

Novo módulo em:

- `Operação > Credenciais`
- rota sugerida: `/stores/:storeId/operations/credentials`

Não deve ficar em comercial nem em financeiro.

#### Onde abrir/acompanhar contas

Novo módulo em:

- `Operação > Contas Abertas`
- rota sugerida: `/stores/:storeId/operations/accounts`

#### Onde fechar contas

Fechamento assistido deve aparecer em:

- `Financeiro > Settlements`
- rota sugerida: `/stores/:storeId/finance/settlements`

Atalhos operacionais podem existir a partir de `Contas Abertas`.

#### Onde gerenciar hosted events

Novo módulo em:

- `Operação > Eventos Privados`
- rota sugerida: `/stores/:storeId/operations/hosted-events`

Não reutilizar `Comercial > Eventos`.

#### Onde ver extratos e conciliações

Em `Financeiro`, separando:

- `Settlements`
- `Reconciliações`

`Finance > Payments` deve continuar reservado ao que já representa pagamentos financeiros/gateway, não contas abertas.

### 13.2 Kiosk

#### Modo pagamento imediato

- usar o fluxo atual de `Shop`
- perfil ideal: `public_checkout_kiosk`

#### Modo comanda/NFC

Fluxo recomendado:

1. tela inicial de identificação
2. leitura de credencial
3. resolução de conta/autorização
4. catálogo/seleção
5. dispense
6. extrato curto/opção de próxima retirada

#### Modo evento

Fluxo recomendado:

1. leitura de credencial ou escolha de grupo/mesa
2. validação de participação no evento
3. seleção de bebida
4. dispense
5. feedback breve de consumo vinculado ao evento

#### Home única ou perfis separados?

Recomendação objetiva:

- **evitar home única** em device público
- usar perfis de dispositivo separados

Home única só faz sentido em `attendant_station`.

#### Quando permitir modo híbrido

Permitir apenas quando houver mediação operacional:

- attendant station
- evento privado controlado
- loja pequena com operação assistida

Evitar em:

- kiosk público de alto volume
- tablet sem atendente

### 13.3 Caixa / atendente

Esta superfície **deve existir**.

Curto prazo:

- pode nascer dentro do admin

Médio prazo:

- deve virar superfície dedicada ou profile de device `attendant_station`

Responsabilidades mínimas:

- localizar conta por nome/tag/código
- consultar extrato
- bloquear/substituir credencial
- aplicar ajuste/estorno
- fechar conta/evento
- registrar pagamento final
- abrir ocorrência de divergência

---

## 14. Proposta de arquitetura de dados

### 14.1 Domínios propostos

| Domínio | Finalidade | Relação com entidades atuais | Nível | Prioridade | Justificativa | Risco |
|---|---|---|---|---|---|---|
| `Credentials` | representar tag/cartão/credencial | pode referenciar `customers`, `openAccounts`, `hostedEvents` | store-level no MVP | alta | inexistente hoje | baixo técnico, alto produto |
| `CredentialAssignments` | histórico de vínculo, bloqueio, troca e perda | liga `Credentials` a cliente/participante/conta | store-level | alta | antifraude e rastreabilidade | baixo |
| `OpenAccounts` | conta aberta operacional | referencia `customerRef`, `status`, `riskPolicy`, `credentialId` | store-level | alta | `orders` não suportam isso | médio |
| `ConsumptionEntries` | ledger cobrável por consumo | referencia `servingSessionId`, `openAccountId`, `hostedEventId`, `participantId` | store-level | alta | separa físico de financeiro | médio |
| `Settlements` | fechamento financeiro de conta/evento | consolida `ConsumptionEntries`; integra `finLedger`/`finPayments` | store-level | alta | inexistente hoje | médio |
| `HostedEvents` | evento operacional privado | pode referenciar `commercialEventId` opcionalmente | store-level | média | domínio inexistente | médio |
| `EventParticipants` | participante/mesa/grupo/responsável | referencia `hostedEventId`, limites e credenciais | store-level | média | necessário para hosted event real | médio |
| `LimitPolicies` | regras de crédito/volume/caução/offline | referenciada por conta/evento/loja | store-level MVP, franchise-level depois | média | antifraude e risco | baixo |
| `DispenseAuthorizations` | autorização curta de consumo | vínculo entre credencial/conta e dispense permitido | store-level | média | essencial para dedupe e antifraude | médio |

### 14.2 Domínios avaliados e não recomendados como coleção MVP

#### `OperationalAuditLogs`

Não recomendo criar como coleção nova no MVP.

Motivo:

- `auditLogs` e `systemLogs` já existem
- o que falta não é “mais um log genérico”, e sim entidades materiais de negócio:
  - `ConsumptionEntries`
  - `Settlements`
  - `CredentialAssignments`
  - `DispenseAuthorizations`

### 14.3 Nível das entidades

Recomendação para MVP:

- store-level para quase tudo
- franchise-level apenas depois

Justificativa:

- o repositório atual é intensamente store-scoped em catálogo, CRM, payments, devices, taps e financeiro
- começar franchise-wide cedo aumentaria muito o custo de regras, índices e governança

---

## 15. Regras arquiteturais que devem ser preservadas

- `orders` devem continuar sendo documentos de **venda imediata**
- `orders` não devem virar conta aberta, histórico de credencial nem ledger de consumo
- `payments` devem continuar representando **tentativas/capturas/cancelamentos de gateway**
- `servingSessions` devem continuar sendo a **verdade física imutável** do que saiu da torneira
- a verdade financeira do consumo pós-pago deve morar em `ConsumptionEntries`
- a verdade do fechamento deve morar em `Settlements`
- a autorização de consumo deve morar no backend, não no client
- a identidade da credencial deve morar em `Credentials`
- o histórico de vínculo/bloqueio deve morar em `CredentialAssignments`
- `commercialEvents` não devem ser a fonte de verdade de hosted events operacionais
- `eventStats/current` não deve ser usado como base sensível de faturamento
- qualquer evolução deve preservar o fluxo imediato atual sem regressão funcional

### Invariantes essenciais

1. dispense físico continua desacoplado da cobrança, mas reconciliado com ela
2. nenhum consumo cobrável pode existir sem trilha para o evento físico ou exceção formal
3. nenhuma credencial deve autorizar consumo sem política de risco verificável
4. nenhum settlement deve mutar `servingSessions`

---

## 16. Roadmap técnico por fases

### Fase 0 — modularização sem mudar comportamento

- Objetivo: separar melhor o fluxo atual sem alterar resultado funcional
- Áreas impactadas:
  - `src/components/DrinkQuickCheckoutModal.tsx`
  - `src/services/salesService.ts`
  - `src/context/ESP32Context.tsx`
  - `src/services/servingSessionService.ts`
  - `shared/types/store.ts`
- Novas entidades: nenhuma obrigatória
- Novas functions: nenhuma obrigatória
- Riscos: médios, por tocar fluxo crítico existente
- Dependências: testes funcionais do fluxo atual
- Valor entregue: base mais segura para evoluir
- Risco de regressão: médio

### Fase 1 — MVP conta aberta / NFC

- Objetivo: suportar credencial + conta aberta + consumo acumulado + fechamento assistido
- Áreas impactadas:
  - `admin/src/App.tsx`
  - `admin/src/config/storeNavConfig.ts`
  - `admin/src/components/store/StoreSettingsTab.tsx`
  - `admin/src/components/store/StoreDeviceList.tsx`
  - `src/pages/Shop.tsx`
  - `src/services/kioskBootstrapService.ts`
  - `src/context/ESP32Context.tsx`
  - `firestore.rules`
  - `firestore.indexes.json`
  - `shared/types/store.ts`
  - ambos `pathResolver.ts`
- Novas entidades:
  - `Credentials`
  - `CredentialAssignments`
  - `OpenAccounts`
  - `ConsumptionEntries`
  - `LimitPolicies`
  - opcional `DispenseAuthorizations`
- Novas functions:
  - `authorizeConsumption`
  - `onServingSessionCreateConsumptionEntry`
  - `closeOpenAccount`
- Riscos:
  - identidade e autorização
  - introdução de NFC/nativo
- Dependências:
  - definir tecnologia NFC ou leitor externo
  - definir política de limite/caução
- Valor entregue:
  - comanda/NFC assistido
  - fechamento posterior
- Risco de regressão: médio se isolado por módulo/profile

### Fase 2 — Hosted events

- Objetivo: evento privado com convidados/mesa/grupo e host pagando no final
- Áreas impactadas:
  - novas rotas admin de operação
  - `CommercialCustomers` apenas como origem opcional de cliente
  - `src/pages/Shop.tsx` ou nova superfície de event guest kiosk
  - `firestore.rules`, `indexes`, `pathResolver`
- Novas entidades:
  - `HostedEvents`
  - `EventParticipants`
  - extensão em `Credentials` e `ConsumptionEntries`
- Novas functions:
  - `createHostedEvent`
  - `authorizeHostedEventConsumption`
  - `closeHostedEventSettlement`
- Riscos:
  - UX de evento
  - limites e agrupamentos
- Dependências:
  - fase 1
- Valor entregue:
  - hosted event real com extrato consolidado
- Risco de regressão: baixo sobre imediato se isolado

### Fase 3 — Settlement / caixa / antifraude / reconciliação

- Objetivo: amadurecer caixa, antifraude e conciliação
- Áreas impactadas:
  - novos módulos de admin/attendant
  - financeiro `finLedger`, `finPayments`, eventualmente `finInvoices`
  - funções de reconciliação
- Novas entidades:
  - `Settlements`
  - opcional `ReconciliationIssues`
- Novas functions:
  - `reconcileConsumptionVsPhysical`
  - `blockCredential`
  - `replaceCredential`
- Riscos:
  - acoplamento com financeiro
  - resolução de exceções
- Dependências:
  - fases 1 e 2
- Valor entregue:
  - operação madura de bar/evento
- Risco de regressão: médio

### Fase 4 — Escala multi-loja / franchise-wide

- Objetivo: identidade e políticas compartilhadas entre lojas
- Áreas impactadas:
  - `shared/types`
  - `pathResolver`
  - `firestore.rules`
  - `customers` e novas entidades
- Novas entidades:
  - eventual espelhamento franchise-level de `Credentials` e `CustomerIdentity`
- Novas functions:
  - sync/replicação/lookup cross-store
- Riscos:
  - alta complexidade de tenancy
  - regras e privacidade
- Dependências:
  - produto já validado nas fases anteriores
- Valor entregue:
  - escala maior por franquia
- Risco de regressão: alto se antecipado cedo demais

---

## 17. Matriz final de recomendação

| Tema | Situação atual | Recomendação | Reaproveitar / adaptar / criar | Prioridade | Risco | Observação crítica |
|---|---|---|---|---|---|---|
| Fluxo imediato | maduro | preservar | reaproveitar | alta | baixo | não mexer no contrato central primeiro |
| `orders` | venda imediata | manter escopo atual | reaproveitar | alta | alto se desviar | não virar open tab |
| `payments` | gateway records | manter escopo atual | reaproveitar | alta | alto se desviar | NFC não é payment |
| `servingSessions` | verdade física | manter centralidade | reaproveitar | alta | baixo | base do consumo físico |
| Customers CRM | comercial | referenciar no MVP, não sobrecarregar | adaptar | média | médio | identidade operacional é mais que CRM |
| `commercialEvents` | CRM/evento comercial | não usar como hosted event | não reaproveitar semanticamente | alta | alto | pode ter `commercialEventId` opcional |
| Store settings | já centraliza config | adicionar capabilities/perfil loja | adaptar | alta | médio | evitar virar tela monolítica |
| Devices | heartbeat/monitoramento | adicionar device profile | adaptar | alta | baixo | melhor lugar para perfil do tablet |
| Open accounts | inexistente | criar domínio novo | criar | alta | médio | requisito central do pós-pago |
| Consumption ledger | inexistente | criar `ConsumptionEntries` | criar | alta | médio | separa físico de cobrança |
| Settlement | inexistente | criar domínio próprio | criar | alta | médio | integrar com `fin*` |
| Hosted events | inexistente operacionalmente | criar módulo novo | criar | média | médio | não usar `eventStats` |
| Antifraude | básico/implícito | criar `LimitPolicies` + authorizations | criar | média | alto | offline pós-pago deve esperar |

---

## 18. Anexo técnico obrigatório

### 18.1 Inventário de rotas

Resumo consolidado:

- Admin:
  - shell global: `/dashboard`, `/stores`, `/team`, `/reports`, `/ranking`, `/forecast`, `/audit`, `/settings`, `/profile`, `/billing`, `/superadmin/*`
  - shell da loja: `orders`, `operations`, `kegs`, `wastage`, `maintenance`, `products`, `inventory`, `members`, `reports`, `settings`, `commercial/*`, `finance/*`, `devices`
- Kiosk:
  - `/`
  - `/shop`
  - `/admin`
  - `/login`
  - `/invite`
  - `/store-select`
  - `/device-not-provisioned`

### 18.2 Inventário de coleções

Coleções centrais atuais:

- `stores` document
- `orders`
- `payments`
- `products`
- `inventoryLogs`
- `devices`
- `hardware/status`
- `taps`
- `kegs`
- `tapAssignments`
- `servingSessions`
- `wastageEvents`
- `maintenanceLogs`
- `systemLogs`
- `notifications`
- `customers`
- `deals`
- `calendarItems`
- `commercialEvents`
- `quotes`
- `finAccounts`
- `finCategories`
- `finCostCenters`
- `finParties`
- `finLedger`
- `finInvoices`
- `finBills`
- `finPayments`
- `eventStats`
- `rankingAgg`
- `challenges`
- `prizes`
- `auditLogs`

### 18.3 Inventário de Cloud Functions

Inventário central:

- pagamentos:
  - `createPayment`
  - `pagbankWebhook`
  - `mercadopagoWebhook`
  - `cancelPagBankPayment`
  - `cancelMercadoPagoPayment`
  - `checkMercadoPagoPaymentStatus`
  - `syncPendingPayments`
  - `onPaymentUpdated`
- ERP:
  - `onServingSessionCreated`
  - `onWastageEventCreated`
  - `aggregateOperationalDaily`
  - `checkKegLevels`
  - `checkMaintenanceOverdue`
  - `cleanupKegProcessedEvents`
  - `resetTapDailyCounters`
- financeiro:
  - `onOrderPaidLedger`
  - `onWastageEventLedger`
  - `onKegStatusChangeLedger`
  - `checkFinanceOverdue`
- ranking/event mode:
  - `toggleEventMode`
  - `onOrderUpdatedRanking`
  - `recalculateRanking30min`
  - `expireEventMode`
- auth/platform:
  - `setCustomClaims`
  - `syncMembershipClaims`
  - `getClaimsForUser`
  - `refreshUserToken`

### 18.4 Inventário de arquivos críticos

- `src/App.tsx`
- `src/pages/Shop.tsx`
- `src/components/DrinkQuickCheckoutModal.tsx`
- `src/services/salesService.ts`
- `src/context/ESP32Context.tsx`
- `src/services/servingSessionService.ts`
- `src/services/deviceHeartbeatService.ts`
- `src/services/kioskBootstrapService.ts`
- `admin/src/App.tsx`
- `admin/src/config/storeNavConfig.ts`
- `admin/src/pages/stores/StoreSubPages.tsx`
- `admin/src/components/store/StoreSettingsTab.tsx`
- `admin/src/components/store/StoreOrdersTab.tsx`
- `admin/src/components/store/StoreOperationsTab.tsx`
- `admin/src/components/store/StoreDeviceList.tsx`
- `admin/src/components/store/DeviceTerminalDialog.tsx`
- `admin/src/components/store/commercial/CommercialEventsTab.tsx`
- `functions/src/payments/paymentService.ts`
- `functions/src/payments/index.ts`
- `functions/src/payments/onPaymentUpdated.ts`
- `functions/src/erp/onServingSessionCreated.ts`
- `functions/src/finance/onOrderPaidLedger.ts`
- `functions/src/ranking/toggleEventMode.ts`
- `shared/types/operations.ts`
- `shared/types/store.ts`
- `shared/types/permissions.ts`
- `src/lib/pathResolver.ts`
- `admin/src/lib/pathResolver.ts`
- `firestore.rules`
- `firestore.indexes.json`
- `android/app/src/main/AndroidManifest.xml`

### 18.5 Tabela de impacto por arquivo

| Arquivo | Impacto provável | Tipo de impacto | Risco | Observação |
|---|---|---|---|---|
| `src/components/DrinkQuickCheckoutModal.tsx` | alto | modularização | alto | separar imediato do futuro pós-pago |
| `src/services/salesService.ts` | alto | isolamento de domínio | médio | manter apenas venda imediata |
| `src/context/ESP32Context.tsx` | médio | extensão de contexto operacional | médio | preservar invariantes físicas |
| `src/services/servingSessionService.ts` | médio | aceitar nova referência lógica | baixo | manter idempotência |
| `src/pages/Shop.tsx` | alto | perfis de device/UX | médio | evitar home híbrida pública |
| `src/services/kioskBootstrapService.ts` | médio | bootstrap de device profile | baixo | boa área de extensão |
| `src/services/deviceHeartbeatService.ts` | médio | perfil do device | baixo | devices já existem |
| `admin/src/App.tsx` | médio | novas rotas | baixo | base sólida |
| `admin/src/config/storeNavConfig.ts` | médio | navegação de novos módulos | baixo | preservar taxonomia |
| `admin/src/components/store/StoreSettingsTab.tsx` | alto | capabilities/perfil loja | médio | risco de UI sobrecarregada |
| `admin/src/components/store/StoreOrdersTab.tsx` | baixo | escopo deve permanecer | alto sem controle | não virar contas abertas |
| `admin/src/components/store/StoreOperationsTab.tsx` | baixo | contextualização futura | baixo | manter foco físico |
| `admin/src/components/store/StoreDeviceList.tsx` | médio | perfil por device | baixo | bom ponto de encaixe |
| `admin/src/components/store/commercial/CommercialEventsTab.tsx` | baixo | não reutilizar semanticamente | alto se forçado | hosted event deve nascer novo |
| `functions/src/payments/paymentService.ts` | médio | settlement final reaproveita parte | médio | não usar para autorização NFC |
| `functions/src/erp/onServingSessionCreated.ts` | médio | gerar consumption ledger futuro | baixo | peça central |
| `functions/src/finance/onOrderPaidLedger.ts` | alto | provável refatoração/substituição parcial | alto | mismatch com fluxo atual |
| `shared/types/store.ts` | médio | capabilities/perfis | baixo | ótimo ponto de extensão |
| `src/lib/pathResolver.ts` | médio | novos subpaths | baixo | precisa alinhar kiosk/admin |
| `admin/src/lib/pathResolver.ts` | médio | novos subpaths | baixo | idem |
| `firestore.rules` | alto | novas regras de domínio | médio | precisa separar bem responsabilidades |
| `firestore.indexes.json` | médio | novos índices | baixo | linear, mas obrigatório |
| `android/app/src/main/AndroidManifest.xml` | alto | suporte NFC | alto | hoje não há permissão NFC |

---

## Conclusão consolidada

Com base no código real atual, a plataforma deve evoluir por **domínio novo de identidade/autorização/conta/settlement**, preservando o self-service imediato como módulo estável.

Estrutura alvo recomendada:

- capacidades base compartilhadas
- módulos opcionais
- perfis operacionais por loja
- perfis de dispositivo por superfície

O que não deve ser feito:

- transformar `orders` em tudo
- tratar NFC como pagamento
- usar `commercialEvents` como hosted event operacional
- liberar pós-pago offline cedo
- criar UX híbrida indiscriminada em kiosk público
