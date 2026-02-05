# Relatorio Tecnico - Arquitetura de Dados (Producao, Canonica)

Data do levantamento: 2026-02-05
Escopo: apenas codigo de runtime (producao). Foram excluidos: __tests__, mocks, dist, coverage, node_modules e auditorias antigas.

## 1. Visao Geral

Este repositorio contem tres superficies de aplicacao e um backend serverless:

- Kiosk App (web, pasta `src/`)
- Admin App (web, pasta `admin/src/`)
- Android Wrapper (Capacitor, pasta `android/` + `capacitor.config.ts`)
- Backend Firebase (Cloud Functions, pasta `functions/src/`)

Fontes de verdade para dados remotos e permissao:

- `firestore.rules`
- `firestore.indexes.json`
- `functions/src` (mutacoes server-side)
- `src` e `admin/src` (leitura/escrita cliente)

Bancos remotos em producao:

- Firebase Firestore (principal)
- Firebase Auth (usuarios + custom claims)

Bancos remotos NAO encontrados no codigo de producao: Realtime Database e Storage (NAO CONFIRMADO - nao ha referencias explicitas em `src/`, `admin/src` ou `functions/src`).

Bancos locais (por app) detalhados nas secoes 3 e 4.

## 2. Bancos Remotos - Firestore + Functions + Regras

Projeto Firebase:

- ID: `open-kiosk-22b2b` (arquivo `.firebaserc` linha 3)
- Rules: `firestore.rules`
- Indexes: `firestore.indexes.json`
- Funcoes: `functions/src`

### 2.1 Mapa de Colecoes e Subcolecoes (canonico)

```
users/{userId}
superadmins/{userId}
settings/{settingId}

invitations/{inviteId}
audit_logs/{logId}

franchises/{franchiseId}
  members/{userId}
  stores/{storeId}
    products/{productId}
    orders/{orderId}
    settings/{settingId}
    dispensers/{dispenserId}
    inventoryLogs/{logId}
    hardware/{docId}
    devices/{deviceId}
    dailyStats/{YYYY-MM-DD}
    metrics/{metricId}
  metrics/{metricId}
  notifications/{notificationId}
  billingEvents/{eventId}
  auditLogs/{logId}

analytics/daily/{YYYY-MM-DD}
analytics/hourly/{YYYY-MM-DD-HH}
```

Evidencias (paths nos rules):
- `firestore.rules`: `superadmins` linha 137, `users` linha 149, `franchises` linha 169, `members` linha 194, `stores` linha 230, `products` linha 251, `orders` linha 286, `inventoryLogs` linha 314, `settings` (store) linha 333, `dispensers` linha 351, `hardware` linha 372, `devices` linha 394, `dailyStats` linha 415, `metrics` (store) linha 429, `metrics` (franchise) linha 442, `notifications` linha 455, `billingEvents` linha 484, `auditLogs` linha 503, `invitations` linha 524, `settings` (global) linha 549, `audit_logs` linha 561, `analytics` linha 585.

### 2.1.1 Mapa Canonico (status)

- Canonico (multi-tenant): `franchises/{franchiseId}/stores/{storeId}/...`
- Canonico global: `users`, `superadmins`, `settings`, `invitations`, `audit_logs`, `analytics/*`
- Legacy: NAO existe em codigo de producao (resolvers e rules sao exclusivamente canonicos)

Evidencias:
- `src/lib/pathResolver.ts` linhas 30-88 (paths canonicos para `stores` e subcollections).
- `admin/src/lib/pathResolver.ts` linhas 15-55 (paths canonicos para `stores` e subcollections).
- `firestore.rules` linha 169 (match `/franchises/{franchiseId}`) e linha 230 (match `/franchises/{franchiseId}/stores/{storeId}`).

### 2.2 Firestore - Detalhamento por Colecao

Formato padrao:
- Path
- Campos e tipos observados
- Quem escreve
- Quem le
- Fluxo de atualizacao
- Relacionamentos

#### 2.2.1 `users/{userId}`

Campos e tipos observados:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId (quando mapeado) |
| email | string |  |
| displayName | string | opcional |
| photoURL | string | opcional |
| phone | string | opcional |
| defaultFranchiseId | string | opcional |
| defaultStoreId | string | opcional |
| role | string | `UserRole` |
| franchiseId | string | opcional |
| storeId | string | opcional |
| storeAccess | string[] | `['*']` ou lista de lojas |
| status | string | ex: active |
| invitedBy | string | opcional |
| isActive | boolean |  |
| createdAt | Timestamp |  |
| lastLoginAt | Timestamp | opcional |
| updatedAt | Timestamp | opcional |
| claimsSyncedAt | Timestamp | opcional |

Quem escreve:
- Cloud Functions (`functions/src/auth/onCreate.ts` cria usuario)
- Admin App (AuthContext atualiza `lastLoginAt` e cria em registro local)
- Functions (`functions/src/auth/claims.ts` atualiza claims em `users`)

Quem le:
- Kiosk App (authService e contextos)
- Admin App (AuthContext e paginas de usuario)
- Cloud Functions (claims e convites)

Fluxo:
- Criacao via Auth onCreate (functions) e/ou registro no Admin.
- Atualizacoes em login e sincronizacao de claims.

Relacionamentos:
- `franchises/{franchiseId}` via `franchiseId`/`defaultFranchiseId`
- `franchises/{franchiseId}/members/{userId}`

Evidencias:
- `src/types/franchise.ts` linhas 229-269 (schema `User`).
- `admin/src/types/user.ts` linhas 13-33 (schema `User` no Admin).
- `functions/src/auth/onCreate.ts` linhas 45-79 e 104-132 (create `users`).
- `functions/src/auth/claims.ts` linhas 196-205 (update `users` com claims).
- `admin/src/context/AuthContext.tsx` linhas 121-133 e 175-192 (setDoc `users`/`lastLoginAt`).

#### 2.2.2 `superadmins/{userId}`

Campos observados:
- email, displayName, photoURL, createdAt, createdBy, status

Quem escreve:
- Cloud Functions (`functions/src/superadmin/setSuperAdmin.ts`)

Quem le:
- Cloud Functions (autorizacao) e Admin App

Evidencias:
- `functions/src/superadmin/setSuperAdmin.ts` linhas 55-85 (schema `superadmins`).

#### 2.2.3 `settings/{settingId}` (global)

Campos observados:
- `default_currency` (documento com `value`)

Quem escreve:
- Admin App (configuracao global)

Quem le:
- Kiosk App (`useSettings`)

Evidencias:
- `src/hooks/useSettings.tsx` linhas 71-83 (leitura `settings/default_currency`).

#### 2.2.4 `invitations/{inviteId}`

Campos e tipos observados:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| email | string |  |
| franchiseId | string |  |
| storeAccess | string[] | `['*']` ou lista de lojas |
| storeId | string | opcional |
| role | string | `UserRole` |
| invitedBy | string | userId |
| invitedByName | string | opcional |
| status | string | pending, accepted, expired, revoked |
| token | string | link unico |
| expiresAt | Timestamp |  |
| createdAt | Timestamp |  |
| acceptedAt | Timestamp | opcional |
| acceptedBy | string | opcional |

Quem escreve:
- Admin App (`admin/src/services/userService.ts` e paginas Team/Invitations)
- Functions (`functions/src/invitations/sendEmail.ts` cria convites)
- Kiosk App (`src/services/franchiseService.ts` cria/atualiza convites)

Quem le:
- Admin App (painel de convites)
- Kiosk App (aceite/validacao)
- Functions (aceite/validacao)

Evidencias:
- `src/types/franchise.ts` linhas 403-432 (schema `Invitation`).
- `admin/src/types/user.ts` linhas 35-51 (schema `Invitation`).
- `admin/src/services/userService.ts` linhas 160-209 (create/list com `franchiseId`, `email`, `status`, `createdAt`).
- `functions/src/invitations/sendEmail.ts` linhas 99-124 (cria convites com `storeAccess`).
- `functions/src/invitations/accept.ts` linhas 42-93 (busca por `token`/`status`).
- `src/services/franchiseService.ts` linhas 604-617 e 642-649 (queries por `token` e `franchiseId/email/status`).

#### 2.2.5 `audit_logs/{logId}` (global)

Campos observados (write atual em `functions/src/auth/claims.ts`):
- action, targetUserId, performedBy, claims, timestamp, franchiseId?, storeId?

Quem escreve:
- Cloud Functions (`functions/src/auth/claims.ts`)

Quem le:
- NAO CONFIRMADO (nao ha leitura direta em `src/`/`admin/src`)

Evidencias:
- `functions/src/auth/claims.ts` linhas 120-139 (schema escrito em `audit_logs`).

#### 2.2.6 `franchises/{franchiseId}`

Campos observados:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| name | string |  |
| slug | string |  |
| ownerId | string | userId |
| ownerEmail | string | admin apenas |
| status | string | ex: active |
| logoUrl | string | opcional |
| primaryColor | string | opcional |
| plan | string | free, trial, starter, pro, enterprise |
| planStatus | string | active, past_due, unpaid, canceled, trial, incomplete, expired, paused |
| billingStatus | string | legado (mesmo dominio de `planStatus`) |
| planExpiresAt | Timestamp | opcional |
| trialEndsAt | Timestamp | opcional |
| stripeCustomerId | string | opcional |
| stripeSubscriptionId | string | opcional |
| features | string[] |  |
| createdAt | Timestamp |  |
| updatedAt | Timestamp |  |
| updatedBy | string | opcional |

Quem escreve:
- Functions (`functions/src/auth/onCreate.ts` cria franquia)
- Functions billing (`functions/src/billing/stripeWebhook.ts` atualiza plano)
- Admin App (edicao de dados)

Quem le:
- Admin App (painel)
- Kiosk App (contexto multi-franquia)

Relacionamentos:
- `franchises/{fid}/members`
- `franchises/{fid}/stores`
- `franchises/{fid}/billingEvents`
- `franchises/{fid}/notifications`
- `franchises/{fid}/auditLogs`
- `franchises/{fid}/metrics`

Evidencias:
- `src/types/franchise.ts` linhas 307-345 (schema `Franchise`).
- `admin/src/types/franchise.ts` linhas 59-86 (schema `Franchise`).
- `functions/src/auth/onCreate.ts` linhas 86-109 (create `franchises`).
- `functions/src/billing/stripeWebhook.ts` linhas 92-145 (update `planStatus`/`billingStatus`).

#### 2.2.7 `franchises/{franchiseId}/members/{userId}`

Campos observados:
- userId, email, displayName, photoURL, role, storeAccess, permissions/customPermissions, invitedBy, invitedAt, joinedAt, addedAt, isActive, updatedAt

Quem escreve:
- Functions (aceite de convite)
- Admin App (gestao de membros)
- Functions (sync de claims)

Quem le:
- Admin App (listagem e RBAC)
- Kiosk App (franchise context e permissions)

Evidencias:
- `src/types/franchise.ts` linhas 365-389 (schema base).
- `admin/src/types/franchise.ts` linhas 89-119 (schema `FranchiseMember`).
- `functions/src/invitations/accept.ts` linhas 151-177 (create/update de member).

#### 2.2.8 `franchises/{franchiseId}/stores/{storeId}`

Campos observados (canonico):
- id, storeId, name, slug, isActive, address, contact, city, state, phone, taxId, currency, taxPercentage, comPort, useThermalPrinter, attractTimeoutSeconds, language, createdAt, updatedAt

Quem escreve:
- Admin App (cadastro/edicao de lojas)

Quem le:
- Kiosk App (settings e inicializacao)
- Admin App (listagem/configuracao)

Evidencias:
- `src/types/store.ts` linhas 24-48 (schema `Store`).
- `admin/src/types/franchise.ts` linhas 123-135 (schema `Store` no Admin).
- `admin/src/services/storeService.ts` linhas 101-121 (create store e settings associados).

#### 2.2.9 `franchises/{franchiseId}/stores/{storeId}/products/{productId}`

Campos observados:
- id, title, price, description, image, tags, inStock, category, stock, minStock, isDrink, sizes, defaultSizeKey, totalMlAvailable, storeId, createdAt, updatedAt

Quem escreve:
- Admin App (catalogo)
- Kiosk App (ajustes de estoque via vendas)

Quem le:
- Kiosk App (catalogo e estoque)
- Admin App (catalogo)

Evidencias:
- `src/types/product.ts` linhas 9-27 (schema `Product`).
- `admin/src/components/store/StoreProductsTab.tsx` linhas 108-133 (create/update produtos).
- `src/services/salesService.ts` linhas 212-257 (update de estoque com `updatedAt`).

#### 2.2.10 `franchises/{franchiseId}/stores/{storeId}/orders/{orderId}`

Campos observados:
- orderNumber (docId), storeId, franchiseId, deviceId, paymentMethod, timestamp, date, hourOfDay, dayOfWeek, timeSlot, isWeekend, isHoliday, status, paymentStatus, createdAt, paidAt, completedAt, lastSync, notes, items[], subtotal, tax, total, currency

Campos de `items`:
- productId, title, price, quantity, total, sizeKey?, sizeLabel?, mlPerUnit?

Quem escreve:
- Kiosk App (cria e atualiza status)

Quem le:
- Admin App (relatorios e dashboards)
- Cloud Functions (analytics)

Relacionamentos:
- `products` (items.productId)
- `devices` (deviceId)

Evidencias:
- `src/services/salesService.ts` linhas 114-156 e 300-366 (schema do order, timestamps e itens).
- `src/services/salesService.ts` linhas 356-360 (docId = `orderNumber`).

#### 2.2.11 `franchises/{franchiseId}/stores/{storeId}/settings/{settingId}`

Documentos observados:
- `config` (configuracoes completas da loja)
- `default_currency`
- `attract_video`

Campos observados em `config` (StoreSettings):
- name, storeId, franchiseId, currency, taxId, taxPercentage, firebaseConfig, email, phone, address, description, timezone, comPort, useThermalPrinter, attractTimeoutSeconds, language, esp32AutoConnect, esp32ConnectionOrder, esp32HeartbeatIntervalMs, esp32LastWifiIp, drinkPickupTimeoutSeconds, drinkPickupSoundEnabled, paymentGatewayConfig, updatedAt

Campos observados em `paymentGatewayConfig`:
- provider, mode, enabledMethods, accessToken, userId, storeId, externalPosId, terminalId, pollingIntervalMs, pollingMaxAttempts, pointExpirationTime, qrExpirationMinutes, configuredAt, configuredBy, lastValidatedAt, lastValidationResult

Quem escreve:
- Admin App (painel de configuracao)
- Kiosk App (sync local e fallback)

Quem le:
- Kiosk App (bootstrap e runtime)
- Admin App (visualizacao)

Evidencias:
- `src/types/store.ts` linhas 58-185 (schema `StoreSettings` e `PaymentGatewayConfig`).
- `src/hooks/useStoreSettings.tsx` linhas 95-109 (enqueue `settings/config` em offline sync).

#### 2.2.12 `franchises/{franchiseId}/stores/{storeId}/dispensers/{dispenserId}`

Campos observados (StoreDispenser):
- id, name, icon, color, isActive, hardware (deviceId, connectionType, valvePin, flowSensorPin, lastKnownIp), calibration (pulsesPerLiter, mlPerSecond), allowedProductIds, lastStatus (connected, lastSeen, firmwareVersion), createdAt, updatedAt

Quem escreve:
- Admin App (cadastro/configuracao)
- Kiosk App (status)

Quem le:
- Kiosk App (operacao/dispense)
- Admin App (monitoramento)

Evidencias:
- `src/types/franchise.ts` linhas 580-613 (schema `StoreDispenser`).
- `src/services/dispenserService.ts` linhas 116-147 e 195-214 (CRUD + timestamps).

#### 2.2.13 `franchises/{franchiseId}/stores/{storeId}/inventoryLogs/{logId}`

Campos observados:
- id, productId, productTitle?, type (ADD/REMOVE/ADJUST), quantity, previousStock?, newStock?, userEmail?, comment?, timestamp, userId?

Quem escreve:
- Admin App (ajustes de estoque)

Quem le:
- Admin App (historico)

Evidencias:
- `src/types/store.ts` linhas 190-201 (schema `InventoryLog`).
- `admin/src/components/store/StoreInventoryTab.tsx` linhas 127-148 (query por `timestamp`).

#### 2.2.14 `franchises/{franchiseId}/stores/{storeId}/hardware/{docId}`

Documento observado:
- `status`

Campos observados:
- esp32Connected, esp32Type, esp32Port, esp32Ip, macAddress, firmwareVersion, dispensersTotal, dispensersOnline, numTaps, taps, hardwareId, printerConnected, printerPort, lastHeartbeat, updatedAt, kioskVersion, franchiseId, storeId

Quem escreve:
- Kiosk App (heartbeat)

Quem le:
- Admin App (monitoramento)

Evidencias:
- `src/services/hardwareStatusService.ts` linhas 18-52 e 83-128 (schema + write com `franchiseId`/`storeId`).

#### 2.2.15 `franchises/{franchiseId}/stores/{storeId}/devices/{deviceId}`

Campos observados:
- deviceId, deviceType, storeId, franchiseId, isOnline, lastSeen, lastSync, uptime, appVersion, ip, mac, firmwareVersion, metadata, esp32 (connected/ip/mac/firmwareVersion)

Quem escreve:
- Kiosk App (heartbeat periodico)

Quem le:
- Admin App (monitoramento)

Evidencias:
- `src/services/deviceHeartbeatService.ts` linhas 37-52 e 145-189 (schema + write com `franchiseId`).

#### 2.2.16 `franchises/{franchiseId}/stores/{storeId}/dailyStats/{YYYY-MM-DD}`

Campos observados (aggregated):
- franchiseId, storeId, date, totalOrders, completedOrders, cancelledOrders, pendingOrders, totalRevenue, avgTicket, paymentMethods, hourlyDistribution, topProducts, processedAt

Quem escreve:
- Cloud Functions (`aggregateDailySales`)

Quem le:
- Admin App (`reportService` via dailyStats)

Evidencias:
- `functions/src/analytics/aggregateDailySales.ts` linhas 21-41 e 241-255 (schema escrito em dailyStats).
- `admin/src/services/reportService.ts` linhas 130-157 (query dailyStats por data).

#### 2.2.17 `franchises/{franchiseId}/stores/{storeId}/metrics/{metricId}`

Documento observado:
- `current`

Campos observados:
- revenue, orders, paidOrders, cancelledOrders, pendingOrders, paymentMethods.*, lastUpdate, updatedAt, franchiseId, storeId

Quem escreve:
- Cloud Functions (`aggOrders`)

Quem le:
- Admin App (dashboards e reports)

Evidencias:
- `functions/src/analytics/aggOrders.ts` linhas 55-116 e 197-215 (update metrics com `franchiseId`/`storeId`).
- `admin/src/services/reportService.ts` linhas 351-377 (fallback `metrics/current`).

#### 2.2.18 `franchises/{franchiseId}/metrics/{metricId}`

Documento observado:
- `current`

Campos observados:
- revenue, orders, paidOrders, cancelledOrders, pendingOrders, paymentMethods.*, lastUpdate, updatedAt, franchiseId

Quem escreve:
- Cloud Functions (`aggOrders`)

Quem le:
- Admin App (fallback via callable `getMetricsAdmin`)

Evidencias:
- `functions/src/analytics/aggOrders.ts` linhas 209-215 (update metrics de franquia).
- `functions/src/analytics/getMetricsAdmin.ts` linhas 176-213 (leitura de metrics franquia).

#### 2.2.19 `franchises/{franchiseId}/notifications/{notificationId}`

Campos observados:
- id, userId, title, message, type, isRead, isDismissed, createdAt, readAt, actionUrl, metadata

Quem escreve:
- Admin App (cria notificacoes)

Quem le:
- Admin App (notifications UI)

Evidencias:
- `admin/src/services/notificationService.ts` linhas 118-135 e 160-177 (create/list).

#### 2.2.20 `franchises/{franchiseId}/billingEvents/{eventId}`

Campos observados:
- id, type, plan, amount, currency, invoiceId, subscriptionId, sessionId, timestamp

Quem escreve:
- Cloud Functions (Stripe webhook)

Quem le:
- Admin App (billing history)

Evidencias:
- `admin/src/types/billing.ts` linhas 76-86 (schema `BillingEvent`).
- `functions/src/billing/stripeWebhook.ts` linhas 98-110 e 178-187 (create `billingEvents`).

#### 2.2.21 `franchises/{franchiseId}/auditLogs/{logId}`

Campos observados:
- id, action, actor, target, details, changes, franchiseId, storeId, ip, userAgent, timestamp

Quem escreve:
- Admin App (auditoria de acoes)

Quem le:
- Admin App (auditoria)

Evidencias:
- `admin/src/types/audit.ts` linhas 89-104 (schema `AuditLog`).
- `admin/src/services/auditService.ts` linhas 104-133 (query `auditLogs`).

#### 2.2.22 `analytics/daily/{YYYY-MM-DD}`

Campos observados (aggOrders):
- revenue, orders, paidOrders, cancelledOrders, pendingOrders, paymentMethods.*, lastUpdate, updatedAt

Quem escreve:
- Cloud Functions (`aggOrders`)

Quem le:
- NAO CONFIRMADO (rules permitem apenas superadmin; Admin usa callable `getMetricsAdmin`)

Evidencias:
- `functions/src/analytics/aggOrders.ts` linhas 118-170 (update em `analytics/daily`).
- `firestore.rules` linha 585 (analytics read apenas superadmin).

#### 2.2.23 `analytics/hourly/{YYYY-MM-DD-HH}`

Campos observados (aggOrders):
- revenue, orders, paidOrders, cancelledOrders, pendingOrders, paymentMethods.*, lastUpdate, updatedAt

Quem escreve:
- Cloud Functions (`aggOrders`)

Evidencias:
- `functions/src/analytics/aggOrders.ts` linhas 118-170 (update em `analytics/hourly`).

### 2.3 Cloud Functions - Mapa de Mutacoes

| Funcao | Trigger | Colecoes afetadas | Impacto |
| --- | --- | --- | --- |
| `auth/onCreate.ts` | Auth onCreate | `users`, `franchises`, `franchises/{fid}/members` | cria usuario e franquia inicial, membro owner |
| `auth/claims.ts` | callable | `users`, `franchises/{fid}/members`, `audit_logs` | sincroniza claims e audita alteracoes |
| `auth/setCustomClaims.ts` | callable | `users` | atualiza claims e flags de usuario |
| `invitations/sendEmail.ts` | callable | `invitations` | cria convites e envia email |
| `invitations/accept.ts` | callable | `invitations`, `users`, `franchises/{fid}/members` | aceita convite e ativa membro |
| `invitations/validateInvitationToken` | HTTP | `invitations`, `franchises` | valida token publico |
| `billing/createCheckout.ts` | callable | `franchises` | inicia checkout stripe |
| `billing/createBillingPortalSession` | callable | `franchises` | cria portal Stripe |
| `billing/stripeWebhook.ts` | webhook HTTP | `franchises`, `franchises/{fid}/billingEvents` | atualiza plano e registra eventos |
| `analytics/aggregateDailySales.ts` | scheduled/callable | `franchises/{fid}/stores/{sid}/dailyStats` | agrega vendas por dia |
| `analytics/aggregateDailySalesHTTP` | callable | `franchises/{fid}/stores/{sid}/dailyStats` | agregacao manual por data |
| `analytics/aggOrders.ts` | firestore trigger | `analytics/*`, `franchises/{fid}/stores/{sid}/metrics`, `franchises/{fid}/metrics` | agregacoes em tempo real |
| `analytics/getMetricsAdmin.ts` | callable | `dailyStats`, `metrics` | fallback de metrics por funcao |
| `superadmin/setSuperAdmin.ts` | callable | `superadmins`, `users` | promove superadmin |
| `superadmin/promoteSuperAdminHTTP.ts` | HTTP | `superadmins`, `users` | promocao via endpoint |

Evidencias:
- `functions/src/index.ts` linhas 9-35 (exports das funcoes).

### 2.4 Regras de Seguranca - Resumo Tecnico

Principios principais (extraido de `firestore.rules`):

- `superadmins` somente superadmins podem ler.
- `users` leitura/escrita permitida ao proprio usuario e superadmins.
- `franchises/{fid}` leitura permitida a membros da franquia; escrita limitada a admin/owner/superadmin.
- Subcolecoes sensiveis (`billingEvents`, `settings`) exigem role apropriada.
- CollectionGroup rules para `members`, `orders`, `devices`, `dailyStats`, `metrics`, `hardware` com checks por franquia.
- `analytics/*` leitura permitida apenas a superadmins; escrita apenas via Functions.
- `audit_logs` global: leitura por superadmin/owner/admin; escrita apenas create.

Evidencias:
- `firestore.rules` linhas 230-333 (stores e settings).
- `firestore.rules` linhas 455-503 (notifications/billingEvents/auditLogs).
- `firestore.rules` linhas 585-667 (analytics e audit_logs).
- `firestore.rules` linhas 699-777 (collectionGroup rules).

### 2.5 Indices (firestore.indexes.json)

Indices definidos:

| CollectionGroup | QueryScope | Campos | Ordem |
| --- | --- | --- | --- |
| `members` | COLLECTION_GROUP | `userId`, `isActive` | ASC, ASC |
| `members` | COLLECTION | `isActive`, `joinedAt` | ASC, DESC |
| `notifications` | COLLECTION | `userId`, `isDismissed`, `createdAt` | ASC, ASC, DESC |
| `notifications` | COLLECTION | `userId`, `createdAt` | ASC, ASC |
| `invitations` | COLLECTION | `franchiseId`, `createdAt` | ASC, DESC |
| `invitations` | COLLECTION | `franchiseId`, `status`, `createdAt` | ASC, ASC, DESC |
| `invitations` | COLLECTION | `token`, `status` | ASC, ASC |
| `invitations` | COLLECTION | `franchiseId`, `email`, `status` | ASC, ASC, ASC |
| `auditLogs` | COLLECTION | `action`, `timestamp` | ASC, DESC |
| `auditLogs` | COLLECTION | `actor.id`, `timestamp` | ASC, DESC |
| `auditLogs` | COLLECTION | `target.type`, `timestamp` | ASC, DESC |
| `orders` | COLLECTION | `status`, `timestamp` | ASC, DESC |

Evidencias:
- `firestore.indexes.json` linhas 4-174 (lista completa de indices).

## 3. Bancos Locais - Kiosk App

### 3.1 IndexedDB (`kiosk_cache`)

Arquivo base: `src/services/cacheService.ts`

Object stores e indices:

| Store | KeyPath | Indices |
| --- | --- | --- |
| `settings` | `id` | nenhum |
| `products` | `id` | `storeId`, `updatedAt` |
| `videos` | `id` | `storeId`, `cachedAt` |
| `syncQueue` | `id` | `createdAt`, `collection` |

Estruturas:
- `SyncQueueItem`: `id`, `operation`, `collection`, `docId`, `data`, `createdAt`, `retryCount`, `storeId`, `franchiseId`.
- Usado por `syncService.ts` para offline-first e replays.

Evidencias:
- `src/services/cacheService.ts` linhas 21-63 (DB `kiosk_cache`, stores e tipos).
- `src/services/cacheService.ts` linhas 111-132 (criacao de object stores e indices).

### 3.2 Cache API

Arquivo base: `src/services/videoCacheService.ts`

- Cache: `kiosk-video-cache-v1`
- Armazena videos de tela de atracao.

Evidencias:
- `src/services/videoCacheService.ts` linha 19 (nome do cache).

### 3.3 localStorage (Kiosk)

Chaves observadas em producao:

- `storeSettings`
- `settingsUpdatedAt`
- `open-kiosk-admin:selectedFranchise`
- `open-kiosk-admin:selectedStore`
- `openKiosk_pinHash`
- `openKiosk_offlineSession`
- `openKiosk_offlineSession_cached`
- `cached_products`
- `products_cache_version`
- `open-kiosk:deviceId`
- `esp32_last_connection`
- `mp_last_terminal_order`
- `mp_polling_state`
- `rememberEmail`
- `kiosk_default_tap_id`
- `kiosk_language`

Evidencias (chaves localStorage):
- `storeSettings`, `settingsUpdatedAt`: `src/hooks/useStoreSettings.tsx` linhas 29, 53, 417.
- `open-kiosk-admin:selectedFranchise`: `src/services/firebase.ts` linhas 159-169.
- `open-kiosk-admin:selectedStore`: `src/context/StoreContext.tsx` linhas 59-94.
- `openKiosk_pinHash`: `src/services/authService.ts` linha 45.
- `openKiosk_offlineSession`: `src/services/authService.ts` linha 48.
- `openKiosk_offlineSession_cached`: `src/services/authService.ts` linha 625.
- `cached_products`, `products_cache_version`: `src/services/productCacheService.ts` linhas 22-23.
- `open-kiosk:deviceId`: `src/services/deviceHeartbeatService.ts` linha 67.
- `esp32_last_connection`: `src/services/esp32CommunicationService.ts` linha 34.
- `mp_last_terminal_order`: `src/services/paymentService.ts` linha 16.
- `mp_polling_state`: `src/hooks/useMercadoPagoPolling.ts` linha 16.
- `rememberEmail`: `src/components/auth/LoginForm.tsx` linha 55.
- `kiosk_default_tap_id`: `src/components/TapSettingsSync.tsx` linha 10.
- `kiosk_language`: `src/i18n/LanguageContext.tsx` linha 22.

### 3.4 Firestore Offline Cache

Arquivo base: `src/services/firebase.ts`

- `initializeFirestore` com `persistentLocalCache`
- `CACHE_SIZE_UNLIMITED`

Evidencias:
- `src/services/firebase.ts` linhas 60-62 e 107-109.

### 3.5 Arquivos JSON locais

Fonte: `src/services/environmentConfigLoader.ts`

Arquivos carregados em runtime:

- `/config/.env.local.json`
- `/assets/config/.env.local.json`
- `/.env.local.json`

Evidencias:
- `src/services/environmentConfigLoader.ts` linhas 77-84.

## 4. Bancos Locais - Admin App

### 4.1 localStorage (Admin)

Chaves observadas:

- `open-kiosk-admin:selectedFranchise`

Evidencias:
- `admin/src/context/FranchiseContext.tsx` linha 107.

### 4.2 Offline Cache

- Firestore Web SDK com cache local padrao (nao customizado).

### 4.3 Outros storages

- Nao ha uso de IndexedDB/SQLite/Room/Realm/DataStore em producao no Admin (NAO CONFIRMADO - nao ha referencias explicitas no repo).

## 5. App Android (Wrapper Capacitor)

- Nao ha persistencia nativa detectada (Room/SQLite/SharedPreferences/DataStore) nos arquivos Java inspecionados.
- O armazenamento local segue o WebView do Kiosk (localStorage, IndexedDB, Cache API).
- Configuracao do wrapper: `capacitor.config.ts`.

Evidencias:
- `android/app/src/main/java/com/openkiosk/app/MainActivity.java` (sem uso de SharedPreferences/Room/SQLite).
- `capacitor.config.ts` linhas 1-42.

## 6. Fluxo de Dados Entre Apps

### 6.1 Kiosk -> Firestore

- Cria `orders` em `franchises/{fid}/stores/{sid}/orders`.
- Atualiza estoque em `products`.
- Atualiza `hardware/status` e `devices` (heartbeat).
- Atualiza `settings/config` em casos de bootstrap/sync.

### 6.2 Admin -> Firestore

- Cria e edita `franchises`, `stores`, `members`, `products`, `inventoryLogs`.
- Mantem `billingEvents` (via functions), `auditLogs`, `notifications`.
- Atualiza `settings` global e por loja.

### 6.3 Kiosk <-> Admin (via Firestore)

- Admin configura `products`, `settings`, `dispensers`.
- Kiosk consome em tempo real via `onSnapshot` e cache offline.
- Kiosk grava vendas e status; Admin consome em dashboards e auditorias.

### 6.4 Cloud Functions -> Firestore

- Agregam `orders` em `dailyStats`, `metrics`, `analytics/*`.
- Atualizam billing e claims.

### 6.5 Sincronizacao e Offline

- Kiosk usa IndexedDB + fila de sync (`syncQueue`) com retry exponencial.
- Firestore offline cache habilitado com persistencia local.
- Conflitos resolvidos por timestamp e ultimo write wins (observado em `syncService`).

Evidencias:
- `src/services/salesService.ts` linhas 300-366 (Kiosk grava `orders`).
- `src/services/hardwareStatusService.ts` linhas 83-128 (Kiosk grava `hardware/status`).
- `src/services/deviceHeartbeatService.ts` linhas 145-189 (Kiosk grava `devices`).
- `admin/src/components/store/StoreProductsTab.tsx` linhas 108-133 (Admin grava `products`).
- `admin/src/components/store/StoreInventoryTab.tsx` linhas 127-148 (Admin grava `inventoryLogs`).
- `functions/src/analytics/aggOrders.ts` linhas 118-170 (Functions agregam `analytics/*` e `metrics`).
- `src/hooks/useStoreSettings.tsx` linhas 95-109 (offline enqueue `settings/config`).

## 7. Tabela-Resumo de Entidades

| Entidade | Colecao Firestore | Local (Kiosk) | Local (Admin) | Observacoes |
| --- | --- | --- | --- | --- |
| User | `users` | localStorage (offline session) | n/a | Claims em Auth e Functions |
| Franchise | `franchises` | cache Firestore | cache Firestore |  |
| FranchiseMember | `franchises/{fid}/members` | cache Firestore | cache Firestore | RBAC |
| Store | `franchises/{fid}/stores` | localStorage `storeSettings` + IndexedDB | cache Firestore |  |
| Product | `.../products` | IndexedDB + localStorage | cache Firestore | estoque atualizado pelo Kiosk |
| Order | `.../orders` | n/a | cache Firestore | agregacao via Functions |
| Dispenser | `.../dispensers` | cache Firestore | cache Firestore | hardware config |
| InventoryLog | `.../inventoryLogs` | n/a | cache Firestore |  |
| HardwareStatus | `.../hardware/status` | n/a | cache Firestore | heartbeat Kiosk |
| Device | `.../devices` | localStorage `open-kiosk:deviceId` | cache Firestore | heartbeat |
| DailyStats | `.../dailyStats` | n/a | cache Firestore | agregado Functions |
| Metrics | `.../metrics/current` | n/a | cache Firestore | agregado Functions |
| Notification | `franchises/{fid}/notifications` | n/a | cache Firestore |  |
| BillingEvent | `franchises/{fid}/billingEvents` | n/a | cache Firestore | stripe webhook |
| AuditLog | `audit_logs` e `franchises/{fid}/auditLogs` | n/a | cache Firestore | dois locais diferentes |
| Invitation | `invitations` | n/a | cache Firestore | onboarding |

## 8. Problemas e Melhorias Recomendadas

1. `audit_logs` global sem leitura em apps (NAO CONFIRMADO)
- Apenas Functions escrevem, nao ha leitura em `src/`/`admin/src`.
- Avaliar se deve haver UI de auditoria global ou remover/arquivar dados.
- Evidencia: `functions/src/auth/claims.ts` linhas 120-139 (write).

2. Campo legado `billingStatus` duplicado com `planStatus`
- `billingStatus` ainda eh escrito por Functions e existe nos tipos.
- Recomendacao: migrar consumo para `planStatus` e remover `billingStatus` apos migracao.
- Evidencias: `functions/src/auth/onCreate.ts` linhas 95-103; `functions/src/billing/stripeWebhook.ts` linhas 92-145; `src/types/franchise.ts` linhas 323-336.

3. Campos sensiveis em `settings/config`
- `paymentGatewayConfig.accessToken` e outros segredos ficam em Firestore.
- Recomendar uso de Secret Manager ou criptografia no backend.
- Evidencia: `src/types/store.ts` linhas 156-174.

4. `analytics/*` restrito a superadmin
- Admin nao le diretamente; fallback via callable `getMetricsAdmin`.
- Manter `getMetricsAdmin` como via oficial para nao abrir rules.
- Evidencias: `firestore.rules` linha 585; `functions/src/analytics/getMetricsAdmin.ts` linhas 41-104.

## 9. Diagramas Textuais (Relacionamentos Principais)

```
Kiosk App
  -> Firestore
     -> franchises/{fid}/stores/{sid}/orders
     -> franchises/{fid}/stores/{sid}/products (update estoque)
     -> franchises/{fid}/stores/{sid}/hardware/status
     -> franchises/{fid}/stores/{sid}/devices/{deviceId}

Admin App
  -> Firestore
     -> franchises/{fid}
     -> franchises/{fid}/stores/{sid}
     -> franchises/{fid}/members
     -> franchises/{fid}/billingEvents
     -> franchises/{fid}/auditLogs

Cloud Functions
  -> onCreate Auth -> users + franchises + members
  -> order triggers -> analytics/* + metrics + dailyStats
  -> billing webhook -> franchises + billingEvents
```

## Apendice - Queries que exigem indices (Firestore)

| Query (colecao) | Trecho (arquivo:linha) | Indice (firestore.indexes.json) |
| --- | --- | --- |
| `members` (collectionGroup: userId + isActive) | `src/services/franchiseService.ts` linhas 227-229 | linhas 4-15 |
| `members` (collection: isActive + orderBy joinedAt) | `src/services/franchiseService.ts` linhas 432-433 | linhas 18-29 |
| `notifications` (userId + isDismissed + orderBy createdAt) | `admin/src/services/notificationService.ts` linhas 122-124 | linhas 32-46 |
| `notifications` (userId + createdAt <) | `admin/src/services/notificationService.ts` linha 303 | linhas 50-60 |
| `auditLogs` (action + orderBy timestamp) | `admin/src/services/auditService.ts` linhas 114-121 | linhas 128-141 |
| `auditLogs` (actor.id + orderBy timestamp) | `admin/src/services/auditService.ts` linhas 114-125 | linhas 142-155 |
| `auditLogs` (target.type + orderBy timestamp) | `admin/src/services/auditService.ts` linhas 114-129 | linhas 156-169 |
| `orders` (status + orderBy timestamp) | `admin/src/components/store/StoreOrdersTab.tsx` linhas 36-42 | linhas 170-181 |
| `invitations` (franchiseId + orderBy createdAt) | `admin/src/services/userService.ts` linhas 161-162 | linhas 64-75 |
| `invitations` (franchiseId + status + orderBy createdAt) | `src/services/franchiseService.ts` linhas 734-736 | linhas 78-93 |
| `invitations` (token + status) | `src/services/franchiseService.ts` linhas 611-612 | linhas 96-107 |
| `invitations` (franchiseId + email + status) | `src/services/franchiseService.ts` linhas 644-646 | linhas 110-124 |

---

Relatorio gerado a partir de codigo de producao. Para novos campos, comparar `firestore.rules` com writes/reads em `src`, `admin/src` e `functions/src`.
