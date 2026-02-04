# Relatorio Tecnico — Arquitetura de Dados (Producao)

Data do levantamento: 2026-02-04
Escopo: apenas codigo de runtime (producao). Foram excluidos testes, mocks, dist, coverage e auditorias antigas.

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

Bancos remotos NAO encontrados:

- Firebase Realtime Database
- Firebase Storage

Bancos locais (por app) detalhados nas secoes 3 e 4.

## 2. Bancos Remotos — Firebase Firestore + Functions + Regras

Projeto Firebase:

- ID: `open-kiosk-22b2b` (arquivo `.firebaserc`)
- Rules: `firestore.rules`
- Indexes: `firestore.indexes.json`
- Funcoes: `functions/src`

### 2.1 Mapa de Colecoes e Subcolecoes (inclui legado)

```
users/{userId}
superadmins/{userId}
roles/{roleId}
settings/{settingId}

invitations/{inviteId}
audit_logs/{logId}

franchises/{franchiseId}
  members/{userId}
  stores/{storeId}
    products/{productId}
    orders/{orderId}
    sales/{saleId}                         (previsto nas regras; uso em codigo e limitado)
    settings/{settingId}                   (ex: config, default_currency, attract_video)
    dispensers/{dispenserId}
    inventoryLogs/{logId}
    hardware/{docId}                       (ex: status)
    devices/{deviceId}
    dailyStats/{YYYY-MM-DD}
    metrics/{metricId}                     (ex: current)
  metrics/{metricId}                       (franchise-level, ex: current)
  notifications/{notificationId}
  billingEvents/{eventId}
  auditLogs/{logId}
  settings/{settingId}

analytics/daily/{YYYY-MM-DD}
analytics/hourly/{YYYY-MM-DD-HH}

stores/{storeId}                            (LEGADO)
  products/{productId}
  orders/{orderId}
  sales/{saleId}
  settings/{settingId}
  dispensers/{dispenserId}
  inventoryLogs/{logId}
  devices/{deviceId}
```

Evidencias (paths nos rules): `firestore.rules` linhas 139 (superadmins), 151 (users), 171 (franchises), 232 (franchises/*/stores), 321 (inventoryLogs), 340 (store settings), 379 (hardware), 401 (devices), 422 (dailyStats), 436 (metrics), 451 (notifications), 480 (billingEvents), 499 (auditLogs), 518 (franchises/*/settings), 557 (stores legacy), 611 (invitations), 636 (settings global), 648 (audit_logs), 664 (roles), 683 (analytics).

### 2.2 Firestore — Detalhamento por Colecao

Formato padrao abaixo:

- Path
- Campos e tipos observados
- Quem escreve
- Quem le
- Fluxo de atualizacao
- Relacionamentos

#### 2.2.1 `users/{userId}`

Campos e tipos observados (tipos em `src/types/franchise.ts` e `admin/src/types/user.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | normalmente igual ao docId |
| email | string |  |
| displayName | string | opcional em admin |
| photoURL | string | opcional |
| phone | string | opcional |
| defaultFranchiseId | string | ultima franquia acessada |
| defaultStoreId | string | ultima loja acessada |
| role | string | `UserRole` (claims) |
| franchiseId | string | pode ser null |
| storeId | string | pode ser null |
| storeAccess | string[] | `'*'` ou lista de lojas |
| status | string | ex: `active` |
| isActive | boolean |  |
| invitedBy | string | opcional |
| createdAt | Timestamp |  |
| lastLoginAt | Timestamp | opcional |
| updatedAt | Timestamp | opcional |
| claimsSyncedAt | Timestamp | opcional |

Quem escreve:

- Cloud Functions em `functions/src/auth/onCreate.ts` e `functions/src/auth/setCustomClaims.ts`
- Admin App pode atualizar flags e defaults

Quem le:

- Kiosk App (authService e contextos)
- Admin App (user management)
- Cloud Functions (claims e convites)

Fluxo de atualizacao:

- Cria no evento de Auth onCreate.
- Atualiza em login e mudancas de claims.

Relacionamentos:

- `franchises/{franchiseId}` via `defaultFranchiseId`
- `franchises/{franchiseId}/members/{userId}`

Evidencias:
- `src/types/franchise.ts` linhas 229-266 (schema `User`).
- `admin/src/types/user.ts` linhas 13-30 (schema `User` no Admin).
- `functions/src/auth/onCreate.ts` linhas 61-82 e 123-142 (create de `users`).
- `functions/src/invitations/accept.ts` linhas 107-118 (update `role`/`franchiseId`/`storeId`).

#### 2.2.2 `superadmins/{userId}`

Campos observados:

- `userId`, `email`, `createdAt`

Quem escreve:

- Cloud Functions (`functions/src/superadmin`)

Quem le:

- Functions (autorizacao de superadmin)
- Admin App (controle de permissao)

#### 2.2.3 `roles/{roleId}` (global)

Observacao:

- Colecao prevista nas regras. Nao ha uso direto em producao no codigo atual.

#### 2.2.4 `settings/{settingId}` (global)

Campos observados:

- `default_currency` (documento com `value`)

Quem escreve:

- Admin App (quando configura global default currency)

Quem le:

- Kiosk App (`useSettings`)

#### 2.2.5 `invitations/{inviteId}`

Campos e tipos observados (em `src/types/franchise.ts`, `admin/src/types/user.ts`, functions):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| email | string |  |
| franchiseId | string |  |
| storeAccess | string[] | ['*'] ou lista de lojas |
| role | string | `UserRole` |
| invitedBy | string | userId |
| invitedByName | string | opcional (admin) |
| status | string | pending, accepted, expired, revoked |
| token | string | link unico |
| expiresAt | Timestamp |  |
| createdAt | Timestamp |  |
| acceptedAt | Timestamp | opcional (admin) |

Quem escreve:

- Admin App (cria convite)
- Functions (`functions/src/invitations` atualiza status)

Quem le:

- Admin App (painel de convites)
- Functions (aceite e validacao)

Evidencias:
- `admin/src/services/userService.ts` linhas 269-276 (create convite: `status`, `token`, `createdAt`, `expiresAt`).
- `functions/src/invitations/sendEmail.ts` linhas 96-127 (convite: `email`, `role`, `franchiseId`, `status`, `token`, `expiresAt`).
- `functions/src/invitations/accept.ts` linhas 39-105 (busca por `token`+`status`, update `acceptedAt`/`acceptedBy`).
- `admin/src/pages/public/InvitePage.tsx` linhas 115-156 (busca convite por `token` e valida `status`/`expiresAt`).

#### 2.2.6 `audit_logs/{logId}` (global)

Campos observados (em `src/types/franchise.ts` e functions/claims):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| userId | string |  |
| userEmail | string |  |
| franchiseId | string |  |
| storeId | string | opcional |
| action | string | `AuditAction` |
| resource | string |  |
| resourceId | string | opcional |
| changes | map | before/after |
| ip | string | opcional |
| userAgent | string | opcional |
| timestamp | Timestamp |  |

Quem escreve:

- Functions (claims, superadmin e flows de auth)
- Admin App pode registrar auditoria especifica (tambem usa `franchises/{fid}/auditLogs`)

Quem le:

- Admin App (relatorios de auditoria)

#### 2.2.7 `franchises/{franchiseId}`

Campos observados (em `src/types/franchise.ts` e `admin/src/types/franchise.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| name | string |  |
| slug | string |  |
| ownerId | string | userId |
| ownerEmail | string | admin apenas |
| logoUrl | string | opcional |
| primaryColor | string | opcional |
| plan | string | starter, growth, enterprise |
| maxStores | number |  |
| maxUsersPerStore | number |  |
| billingStatus | string | active, past_due, canceled, trial |
| trialEndsAt | Timestamp | opcional |
| stripeCustomerId | string | opcional |
| stripeSubscriptionId | string | opcional |
| features | string[] |  |
| createdAt | Timestamp |  |
| updatedAt | Timestamp |  |

Quem escreve:

- Functions (`auth/onCreate` cria franquia, `billing` atualiza billing)
- Admin App (edicao de dados e limites)

Quem le:

- Admin App (painel)
- Kiosk App (carrega franquia para modo multi-tenant)

Relacionamentos:

- `franchises/{fid}/members`
- `franchises/{fid}/stores`
- `franchises/{fid}/billingEvents`
- `franchises/{fid}/notifications`
- `franchises/{fid}/auditLogs`

#### 2.2.8 `franchises/{franchiseId}/members/{userId}`

Campos observados (em `src/types/franchise.ts` e `admin/src/types/franchise.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| userId | string | id do usuario |
| email | string | admin apenas |
| displayName | string | admin apenas |
| role | string | `UserRole` |
| storeAccess | string[] | ['*'] ou lista de lojas |
| customPermissions | string[] | opcional (kiosk) |
| permissions | string[] | opcional (admin) |
| invitedBy | string | userId |
| invitedAt | Timestamp |  |
| joinedAt | Timestamp | opcional |
| addedAt | Timestamp | opcional |
| isActive | boolean | opcional |
| orderId | string | opcional (admin) |

Quem escreve:

- Functions (aceite de convite)
- Admin App (gestao de membros)
- Functions (sync de claims)

Quem le:

- Admin App (listagem e RBAC)
- Kiosk App (franchise context e permissions)

Relacionamentos:

- `users/{userId}`
- `franchises/{franchiseId}`

#### 2.2.9 `franchises/{franchiseId}/stores/{storeId}`

Campos observados (em `src/types/store.ts` e `admin/src/types/franchise.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| storeId | string | slug/identificador unico |
| name | string |  |
| slug | string |  |
| isActive | boolean |  |
| address | object | StoreAddress ou string (admin) |
| contact | object | StoreContact (kiosk) |
| city | string | admin |
| state | string | admin |
| phone | string | admin |
| taxId | string |  |
| currency | string |  |
| taxPercentage | number |  |
| comPort | string | opcional |
| useThermalPrinter | boolean | opcional |
| attractTimeoutSeconds | number | opcional |
| language | 'en' | 'pt-BR' | opcional |
| created_at | string | kiosk legado usa snake_case |
| updated_at | string | kiosk legado |
| createdAt | Timestamp | admin |
| updatedAt | Timestamp | admin |

Quem escreve:

- Admin App (cadastro e edicao de lojas)
- Kiosk App (fallback de recuperacao local, modo legado)

Quem le:

- Kiosk App (settings e inicializacao)
- Admin App (listagem e configuracao)

Relacionamentos:

- Subcolecoes listadas abaixo

#### 2.2.10 `franchises/{franchiseId}/stores/{storeId}/products/{productId}`

Campos observados (em `src/types/product.ts` e writes em `useFirebaseProducts.tsx` e `salesService.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| title | string |  |
| price | number |  |
| description | string |  |
| image | string | opcional |
| tags | string[] |  |
| inStock | boolean |  |
| category | string |  |
| stock | number |  |
| minStock | number | opcional |
| isDrink | boolean | opcional |
| sizes | array | ProductSize[] |
| defaultSizeKey | string | opcional |
| totalMlAvailable | number | opcional |
| storeId | string | opcional |
| updatedAt | Timestamp | em cache/local, pode existir em Firestore |

Quem escreve:

- Admin App (catalogo)
- Kiosk App (ajustes de estoque via vendas)

Quem le:

- Kiosk App (catalogo e estoque)
- Admin App (catalogo)

Relacionamentos:

- Usado por `orders` e `inventoryLogs`

Evidencias:
- `src/types/product.ts` linhas 9-27 (schema do produto).
- `admin/src/components/store/StoreProductsTab.tsx` linhas 108-133 (create/update em `.../products`).
- `src/services/salesService.ts` linhas 150-211 (leitura/uso de `productId`, `title`, `price`, `quantity` em `orders`).

#### 2.2.11 `franchises/{franchiseId}/stores/{storeId}/orders/{orderId}`

Campos observados (em `src/services/salesService.ts` e `admin/src/services/reportService.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| orderNumber | string | gerado pelo Kiosk |
| storeId | string | opcional (inclusao explicita) |
| franchiseId | string | opcional |
| deviceId | string | rastreio do dispositivo |
| paymentMethod | string | `PaymentMethod` |
| timestamp | Date | SaleTimingData.timestamp |
| date | string | YYYY-MM-DD |
| hourOfDay | number | 0-23 |
| dayOfWeek | number | 0-6 |
| timeSlot | string | morning/afternoon/evening/night |
| isWeekend | boolean |  |
| isHoliday | boolean | opcional |
| status | string | completed (Kiosk) |
| paymentStatus | string | paid (Kiosk) |
| createdAt | Timestamp | serverTimestamp |
| paidAt | Timestamp | serverTimestamp |
| completedAt | Timestamp | serverTimestamp |
| lastSync | Timestamp | serverTimestamp |
| notes | string | vazio por padrao |
| items | array | detalhes por item |
| subtotal | number |  |
| tax | number |  |
| total | number |  |
| currency | string |  |

Campos de `items`:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| productId | string |  |
| title | string |  |
| price | number |  |
| quantity | number |  |
| total | number |  |
| sizeKey | string | opcional (bebidas) |
| sizeLabel | string | opcional |
| mlPerUnit | number | opcional |

Quem escreve:

- Kiosk App (cria e atualiza status)

Quem le:

- Admin App (relatorios e dashboards)
- Cloud Functions (analytics)

Relacionamentos:

- `products` (items.productId)
- `devices` (deviceId)

Evidencias:
- `src/services/salesService.ts` linhas 20-28 (timing data: `timestamp`, `date`, `hourOfDay`, `dayOfWeek`, `timeSlot`, `isWeekend`).
- `src/services/salesService.ts` linhas 166-212 (schema do `order`: `paymentMethod`, status, timestamps, `items`, `subtotal`, `tax`, `total`, `currency`).

#### 2.2.12 `franchises/{franchiseId}/stores/{storeId}/sales/{saleId}`

Observacao:

- Subcolecao prevista nas regras, mas o fluxo atual grava em `orders`.
- Manter como legado/compatibilidade.

#### 2.2.13 `franchises/{franchiseId}/stores/{storeId}/settings/{settingId}`

Documentos observados:

- `config` (configuracoes completas da loja)
- `default_currency`
- `attract_video`

Campos observados em `config` (baseado em `StoreSettings`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| name | string |  |
| storeId | string |  |
| franchiseId | string | opcional |
| currency | string |  |
| taxId | string |  |
| taxPercentage | number |  |
| firebaseConfig | map | apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId |
| email | string | opcional |
| phone | string | opcional |
| address | string | opcional |
| description | string | opcional |
| timezone | string | opcional |
| comPort | string | opcional |
| useThermalPrinter | boolean | opcional |
| attractTimeoutSeconds | number | opcional |
| language | 'en' | 'pt-BR' | opcional |
| esp32AutoConnect | boolean | opcional |
| esp32ConnectionOrder | string[] | opcional |
| esp32HeartbeatIntervalMs | number | opcional |
| esp32LastWifiIp | string | opcional |
| drinkPickupTimeoutSeconds | number | opcional |
| drinkPickupSoundEnabled | boolean | opcional |
| paymentGatewayConfig | map | ver abaixo |

Campos observados em `paymentGatewayConfig`:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| provider | string | mercadopago, stone, pagseguro, cielo, stripe |
| mode | string | sandbox, production |
| enabledMethods | map | pix, credit, debit |
| accessToken | string |  |
| userId | string | opcional |
| storeId | string | opcional |
| externalPosId | string | opcional |
| terminalId | string | opcional |
| pollingIntervalMs | number | opcional |
| pollingMaxAttempts | number | opcional |
| pointExpirationTime | string | opcional |
| qrExpirationMinutes | number | opcional |
| configuredAt | string | opcional |
| configuredBy | string | opcional |
| lastValidatedAt | string | opcional |
| lastValidationResult | string | opcional |

Quem escreve:

- Admin App (painel de configuracao)
- Kiosk App (sync local e fallback)

Quem le:

- Kiosk App (bootstrap e runtime)
- Admin App (visualizacao)

#### 2.2.14 `franchises/{franchiseId}/stores/{storeId}/dispensers/{dispenserId}`

Campos observados (em `src/types/franchise.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| name | string |  |
| icon | string |  |
| color | string |  |
| isActive | boolean |  |
| hardware | map | deviceId, connectionType, valvePin, flowSensorPin, lastKnownIp |
| calibration | map | pulsesPerLiter, mlPerSecond |
| allowedProductIds | string[] |  |
| lastStatus | map | connected, lastSeen, firmwareVersion |
| createdAt | Timestamp |  |
| updatedAt | Timestamp |  |

Quem escreve:

- Admin App (cadastro e configuracao de torneiras)
- Kiosk App (atualiza status) 

Quem le:

- Kiosk App (operacao/dispense)
- Admin App (monitoramento)

#### 2.2.15 `franchises/{franchiseId}/stores/{storeId}/inventoryLogs/{logId}`

Campos observados (em `src/types/store.ts` e admin components):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| productId | string |  |
| productTitle | string |  |
| type | string | ADD, REMOVE, ADJUST |
| quantity | number |  |
| previousStock | number |  |
| newStock | number |  |
| userEmail | string | opcional |
| comment | string | opcional |
| timestamp | Timestamp |  |
| userId | string | opcional |

Quem escreve:

- Admin App (ajustes de estoque)

Quem le:

- Admin App (historico)

Evidencias:
- `admin/src/components/store/StoreInventoryTab.tsx` linhas 74-94 (schema completo do log).
- `admin/src/components/store/StoreInventoryTab.tsx` linhas 138-170 (write em `inventoryLogs` + `timestamp`).

#### 2.2.16 `franchises/{franchiseId}/stores/{storeId}/hardware/{docId}`

Documento observado:

- `status`

Campos observados (em `src/services/hardwareStatusService.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| franchiseId | string | gravado pelo Kiosk |
| storeId | string | gravado pelo Kiosk |
| esp32Connected | boolean |  |
| esp32Type | string | usb, wifi, bluetooth |
| esp32Port | string | opcional |
| esp32Ip | string | opcional |
| macAddress | string | opcional |
| firmwareVersion | string | opcional |
| dispensersTotal | number |  |
| dispensersOnline | number |  |
| numTaps | number | opcional |
| taps | array | TapStatusReport[] |
| hardwareId | string | opcional |
| printerConnected | boolean |  |
| printerPort | string | opcional |
| lastHeartbeat | Timestamp |  |
| updatedAt | Timestamp |  |
| kioskVersion | string | opcional |

Quem escreve:

- Kiosk App (heartbeat)

Quem le:

- Admin App (monitoramento)

Evidencias:
- `src/services/deviceHeartbeatService.ts` linhas 39-52 (schema de `DeviceInfo`).
- `src/services/deviceHeartbeatService.ts` linhas 175-203 (write de heartbeat com `franchiseId`/`storeId`).

Evidencias:
- `src/services/hardwareStatusService.ts` linhas 24-53 (schema `HardwareStatus`, inclui `franchiseId`/`storeId`).
- `src/services/hardwareStatusService.ts` linhas 115-137 (write em `hardware/status`).

#### 2.2.17 `franchises/{franchiseId}/stores/{storeId}/devices/{deviceId}`

Campos observados (em `src/services/deviceHeartbeatService.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| deviceId | string |  |
| deviceType | string | esp32, kiosk, tablet, unknown |
| storeId | string |  |
| franchiseId | string | opcional |
| isOnline | boolean |  |
| lastSeen | Timestamp |  |
| lastSync | Timestamp |  |
| uptime | number | segundos |
| appVersion | string |  |
| ip | string | opcional |
| mac | string | opcional |
| firmwareVersion | string | opcional |
| metadata | map | opcional |
| esp32 | map | connected, ip, mac, firmwareVersion |

Quem escreve:

- Kiosk App (heartbeat periodico)

Quem le:

- Admin App (monitoramento)

#### 2.2.18 `franchises/{franchiseId}/stores/{storeId}/dailyStats/{YYYY-MM-DD}`

Campos observados (em `functions/src/analytics/aggregateDailySales.ts` e `admin/src/services/reportService.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| date | string | YYYY-MM-DD |
| franchiseId | string |  |
| storeId | string |  |
| totalOrders | number |  |
| completedOrders | number |  |
| cancelledOrders | number |  |
| pendingOrders | number |  |
| totalRevenue | number |  |
| avgTicket | number |  |
| paymentMethods | map | agregados por método |
| hourlyDistribution | map | agregados por hora |
| topProducts | array | top 10 por receita |
| processedAt | Timestamp |  |

Quem escreve:

- Cloud Functions (aggregateDailySales)

Quem le:

- Admin App (reports)

Evidencias:
- `functions/src/analytics/aggregateDailySales.ts` linhas 21-34 (schema de `DailyStats`).

#### 2.2.19 `franchises/{franchiseId}/stores/{storeId}/metrics/{metricId}`

Documento observado:

- `current`

Campos observados (em `functions/src/analytics/aggOrders.ts` e `admin/src/services/metricsService.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| franchiseId | string |  |
| storeId | string |  |
| orders | number | contador agregado |
| revenue | number | receita agregada |
| paidOrders | number | opcional |
| cancelledOrders | number | opcional |
| pendingOrders | number | opcional |
| lastUpdate | Timestamp |  |
| updatedAt | Timestamp |  |

Quem escreve:

- Cloud Functions (aggOrders)

Quem le:

- Admin App (dashboards)

Evidencias:
- `functions/src/analytics/aggOrders.ts` linhas 45-55 (schema de `MetricsUpdate`).
- `functions/src/analytics/aggOrders.ts` linhas 103-115 (grava `franchiseId`/`storeId` em metrics).

#### 2.2.20 `franchises/{franchiseId}/notifications/{notificationId}`

Campos observados (em `admin/src/services/notificationService.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| userId | string |  |
| priority | string | low, normal, high, critical |
| title | string |  |
| message | string |  |
| type | string |  |
| isRead | boolean |  |
| isDismissed | boolean |  |
| createdAt | Timestamp |  |
| readAt | Timestamp | opcional |
| storeId | string | opcional |
| storeName | string | opcional |
| orderId | string | opcional |
| productId | string | opcional |
| actionUrl | string | opcional |
| actionLabel | string | opcional |
| metadata | map | opcional |

Quem escreve:

- Admin App (cria notificacoes)
- Functions (eventos automaticos, se habilitado no futuro)

Quem le:

- Admin App (notifications UI)

Evidencias:
- `admin/src/services/notificationService.ts` linhas 29-66 (schema de `Notification`).
- `admin/src/services/notificationService.ts` linhas 92-121 (query por `userId`/`isDismissed` + `orderBy createdAt`).

#### 2.2.21 `franchises/{franchiseId}/billingEvents/{eventId}`

Campos observados (em `admin/src/types/billing.ts` e `functions/src/billing/stripeWebhook.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| type | string | checkout_completed, subscription_updated, invoice_paid, etc |
| plan | string | opcional |
| amount | number | opcional |
| currency | string | opcional |
| invoiceId | string | opcional |
| subscriptionId | string | opcional |
| sessionId | string | opcional |
| timestamp | Timestamp |  |

Quem escreve:

- Cloud Functions (stripe webhook)

Quem le:

- Admin App (billing history)

Evidencias:
- `functions/src/billing/stripeWebhook.ts` linhas 88-112 e 170-209 (writes em `billingEvents`).
- `admin/src/types/billing.ts` linhas 10-40 (schema `BillingEvent`).

#### 2.2.22 `franchises/{franchiseId}/auditLogs/{logId}`

Campos observados (em `admin/src/types/audit.ts`):

| Campo | Tipo | Observacao |
| --- | --- | --- |
| id | string | docId |
| action | string |  |
| actor | map | id, email, name |
| target | map | type, id, name |
| details | map | opcional |
| changes | map | before/after |
| franchiseId | string |  |
| storeId | string | opcional |
| ip | string | opcional |
| userAgent | string | opcional |
| timestamp | Timestamp |  |

Quem escreve:

- Admin App (auditoria de acoes)

Quem le:

- Admin App (auditoria)

Evidencias:
- `admin/src/types/audit.ts` linhas 10-40 (schema de `AuditLog`).
- `admin/src/services/auditService.ts` linhas 66-98 (query com `orderBy timestamp` e filtros).

#### 2.2.23 `franchises/{franchiseId}/settings/{settingId}`

Observacao:

- Colecao prevista nas regras. Nao ha uso direto em producao no codigo atual.

#### 2.2.24 `analytics/daily/{YYYY-MM-DD}`

Campos observados (em `functions/src/analytics/aggOrders.ts`):

- `revenue`, `orders`, `paidOrders`, `cancelledOrders`, `pendingOrders`, `paymentMethods.*`, `lastUpdate`, `updatedAt`
- DocId = `YYYY-MM-DD` (nao ha campo `date` gravado no documento)

Quem escreve:

- Cloud Functions (trigger em orders)

Quem le:

- Admin App (metrics globais, se habilitado)

Evidencias:
- `functions/src/analytics/aggOrders.ts` linhas 64-104 (incrementos de `revenue`, `orders`, `paymentMethods.*`, `lastUpdate`).

#### 2.2.25 `analytics/hourly/{YYYY-MM-DD-HH}`

Campos observados:

- `revenue`, `orders`, `paidOrders`, `cancelledOrders`, `pendingOrders`, `paymentMethods.*`, `lastUpdate`, `updatedAt`
- DocId = `YYYY-MM-DD-HH` (nao ha campo `hour` gravado no documento)

Quem escreve:

- Cloud Functions (trigger em orders)

Evidencias:
- `functions/src/analytics/aggOrders.ts` linhas 91-104 (atualizacoes em `analytics/hourly`).

#### 2.2.26 `stores/{storeId}` (LEGADO)

Colecao legado usada quando `franchiseMode` esta desabilitado. Estruturas espelham `franchises/{fid}/stores/{sid}` com subcolecoes equivalentes.

- `products`, `orders`, `sales`, `settings`, `dispensers`, `inventoryLogs`, `devices`, `metrics/current`

Uso atual:

- Kiosk App ainda tem caminhos legado em `useFirebaseProducts.tsx`, `useStoreSettings.tsx`, `storeService.ts`, `deviceHeartbeatService.ts`.
- Admin App opera principalmente no modo franquia.

### 2.3 Cloud Functions — Mapa de Mutacoes

| Funcao | Trigger | Colecoes afetadas | Impacto |
| --- | --- | --- | --- |
| `auth/onCreate.ts` | Auth onCreate | `users`, `franchises`, `franchises/{fid}/members` | cria usuario e franquia inicial, membro owner |
| `auth/claims.ts` | callable | `users`, `franchises/{fid}/members`, `audit_logs` | sincroniza claims e audita alteracoes |
| `auth/setCustomClaims.ts` | callable | `users` | atualiza claims e flags de usuario |
| `invitations/sendEmail.ts` | callable | `invitations` | cria convites e envia email |
| `invitations/accept.ts` | callable | `invitations`, `users`, `franchises/{fid}/members` | aceita convite e ativa membro |
| `billing/createCheckout.ts` | callable | `franchises` | inicia checkout stripe |
| `billing/stripeWebhook.ts` | webhook HTTP | `franchises`, `franchises/{fid}/billingEvents` | atualiza plano e registra eventos |
| `analytics/aggregateDailySales.ts` | scheduled/callable | `franchises/{fid}/stores/{sid}/dailyStats` | agrega vendas por dia |
| `analytics/aggOrders.ts` | firestore trigger | `analytics/daily`, `analytics/hourly`, `franchises/{fid}/stores/{sid}/metrics`, `franchises/{fid}/metrics`, `stores/{sid}/metrics` | agregacoes em tempo real |
| `superadmin/setSuperAdmin.ts` | callable | `superadmins`, `users` | promove superadmin |
| `superadmin/promoteSuperAdminHTTP.ts` | HTTP | `superadmins`, `users` | promocao via endpoint |

### 2.4 Regras de Seguranca — Resumo Tecnico

Principios principais (extraido de `firestore.rules`):

- `superadmins` somente superadmins podem ler/escrever.
- `users` leitura/escrita permitida ao proprio usuario, admins da franquia e superadmins.
- `franchises/{fid}` leitura permitida a membros da franquia; escrita limitada a admin/owner/superadmin.
- Subcolecoes sensiveis (`billingEvents`, `settings`) exigem role apropriada.
- CollectionGroup rules para `members`, `orders`, `devices`, `dailyStats`, `metrics`, `hardware` com checks por franquia.
- `analytics/*` leitura permitida a membros/admin; escrita apenas via Functions.
- Colecoes globais `audit_logs`, `roles`, `settings` com regras mais restritas.

Observacao:

- Regras contemplam colecoes legacy `stores/{storeId}` e `sales`.

### 2.5 Indices (firestore.indexes.json)

Indices definidos (collectionGroup):

| CollectionGroup | Campos | Ordem |
| --- | --- | --- |
| `members` | `userId`, `isActive` | ASC, ASC |
| `members` | `isActive`, `joinedAt` | ASC, DESC |
| `notifications` | `userId`, `isDismissed`, `createdAt` | ASC, ASC, DESC |
| `auditLogs` | `action`, `timestamp` | ASC, DESC |
| `orders` | `status`, `timestamp` | ASC, DESC |
| `orders` | `date`, `timestamp` | ASC, DESC |
| `orders` | `storeId`, `timestamp` | ASC, DESC |
| `orders` | `paymentStatus`, `timestamp` | ASC, DESC |
| `orders` | `status`, `paymentStatus`, `timestamp` | ASC, ASC, DESC |
| `orders` | `paymentMethod`, `timestamp` | ASC, DESC |
| `orders` | `paymentStatus`, `createdAt` | ASC, DESC |
| `orders` | `franchiseId`, `createdAt` | ASC, DESC |
| `orders` | `storeId`, `createdAt` | ASC, DESC |
| `dailyStats` | `franchiseId`, `date` | ASC, DESC |
| `dailyStats` | `storeId`, `date` | ASC, DESC |
| `devices` | `franchiseId`, `lastSeen` | ASC, DESC |
| `devices` | `storeId`, `lastSeen` | ASC, DESC |
| `metrics` | `franchiseId`, `updatedAt` | ASC, DESC |

## 3. Bancos Locais — Kiosk App

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

- `SyncQueueItem`: `id`, `operation`, `collection`, `docId`, `data`, `createdAt`, `retryCount`, `storeId`.
- Usado por `syncService.ts` para offline-first e replays.

### 3.2 Cache API

Arquivo base: `src/services/videoCacheService.ts`

- Cache: `kiosk-video-cache-v1`
- Armazena videos de tela de atracao (attract screen).

### 3.3 localStorage (Kiosk)

Chaves observadas em producao:

- `storeSettings`
- `storeInitialized`
- `settingsUpdatedAt`
- `open-kiosk-admin:selectedFranchise`
- `open-kiosk-admin:selectedStore`
- `selectedFranchiseId` (legado)
- `openKiosk_pinHash`
- `openKiosk_offlineSession`
- `openKiosk_offlineSession_cached`
- `cached_products`
- `products_cache_version`
- `open-kiosk:deviceId`
- `esp32_last_connection`
- `mp_last_terminal_order`
- `mp_polling_state`
- `adminPin_{storeId}`
- `rememberEmail`
- `franchiseMode`
- `setupCompleted`
- `currentStoreId`
- `kiosk_default_tap_id`
- `kiosk_language`

Observacoes:

- `storeSettings` e `settingsUpdatedAt` sao usados como hot cache e fallback.
- `openKiosk_offlineSession` habilita login offline via PIN.
- `kiosk_default_tap_id` e local por tablet.

### 3.4 Firestore Offline Cache

Arquivo base: `src/services/firebase.ts`

- `initializeFirestore` com `persistentLocalCache`
- `CACHE_SIZE_UNLIMITED`

### 3.5 Arquivos JSON locais

Fonte: `src/services/environmentConfigLoader.ts`

Arquivos carregados em runtime:

- `public/config/.env.local.json`
- `public/assets/config/.env.local.json`
- `public/.env.local.json`

Esses arquivos incluem `storeId`, `franchiseId` e config Firebase.

## 4. Bancos Locais — Admin App

### 4.1 localStorage (Admin)

Chaves observadas:

- `open-kiosk-admin:selectedFranchise`
- `franchiseMode`

### 4.2 Offline Cache

- Firestore Web SDK com cache local padrao (nao customizado).

### 4.3 Outros storages

- Nao ha uso de IndexedDB/SQLite/Room/Realm/DataStore em producao no Admin.

## 5. App Android (Wrapper Capacitor)

- Nao ha persistencia nativa detectada em `android/app/src` (Room/SQLite/SharedPreferences/DataStore).
- O armazenamento segue o WebView do Kiosk (localStorage, IndexedDB, Cache API).
- Configuracao do wrapper: `capacitor.config.ts`.

## 6. Fluxo de Dados Entre Apps

### 6.1 Kiosk -> Firestore

- Cria `orders` em `franchises/{fid}/stores/{sid}/orders`.
- Atualiza estoque em `products`.
- Atualiza `hardware/status` e `devices` (heartbeat).
- Atualiza `settings/config` em casos de bootstrap ou sync.

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
- Conflitos resolvidos por timestamp e ultimo write wins (observado em syncService).

## 7. Tabela-Resumo de Entidades

| Entidade | Colecao Firestore | Local (Kiosk) | Local (Admin) | Observacoes |
| --- | --- | --- | --- | --- |
| User | `users` | localStorage (offline session) | n/a | Claims em Auth e Functions |
| Franchise | `franchises` | cache Firestore | cache Firestore |  |
| FranchiseMember | `franchises/{fid}/members` | cache Firestore | cache Firestore | RBAC |
| Store | `franchises/{fid}/stores` | localStorage `storeSettings` + IndexedDB | cache Firestore | modo legado suporta `stores/{sid}` |
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
| Invitation | `invitations` | n/a | cache Firestore | usado em onboarding |

## 8. Problemas e Melhorias Recomendadas

1. Duplicidade de caminhos (legacy vs franchise)

- Existem operacoes em `stores/{storeId}` e em `franchises/{fid}/stores/{sid}`. 
- Risco de dados divergentes e dificuldade de manutencao.

2. Nomes e schemas divergentes

- `created_at` e `updated_at` no Kiosk legado vs `createdAt`/`updatedAt` no Admin.
- `audit_logs` global vs `franchises/{fid}/auditLogs` (duas fontes de auditoria).
- `inventoryLogs` vs `inventory_logs` (nome utilizado no `pathResolver` para views, risco de inconsistencia).

3. Regras e codigo desbalanceados

- Regras preveem `sales` e `settings` por franquia que nao aparecem no fluxo atual.
- Verificar se essas colecoes sao realmente usadas em producao ou devem ser removidas.

4. Indices vs queries

- Queries que usam `createdAt` e `timestamp` em `orders` precisam estar alinhadas com indices. 
- Verificar se todo filtro usado no Admin possui indice correspondente.

5. Offline sync e conflitos

- `syncService` usa last write wins e `_syncedAt`. Falta log detalhado e resolucao deterministica de conflito para edicoes concorrentes.

6. Campos sensiveis em `settings/config`

- `paymentGatewayaConfig.accessToken` e outros segredos ficam em Firestore. Considerar criptografia ou storage seguro.

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

---

Relatorio gerado a partir de codigo de producao. Para novos campos, comparar `firestore.rules` com writes/reads em `src`, `admin/src` e `functions/src`.
