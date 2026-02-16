# 📊 Inventário Completo de Armazenamento — Open Kiosk

> **Gerado em:** 14/02/2026  
> **Arquitetura:** Multi-Tenant por Franquias  
> **Apps consumidores:** Admin Web, Kiosk App, Cloud Functions

---

## Índice Geral

### Parte I — Armazenamento Remoto (Firebase)
1. [Visão Geral da Hierarquia Firestore](#1-visão-geral-da-hierarquia-firestore)
2. [Coleções Globais (Raiz)](#2-coleções-globais-raiz)
   - 2.1 [superadmins](#21-superadmins)
   - 2.2 [users](#22-users)
   - 2.3 [invitations](#23-invitations)
   - 2.4 [audit_logs (legado)](#24-audit_logs-legado)
   - 2.5 [settings (global)](#25-settings-global)
   - 2.6 [analytics](#26-analytics)
3. [Coleção franchises](#3-coleção-franchises)
   - 3.1 [franchises (documento)](#31-franchises-documento)
   - 3.2 [members (subcoleção)](#32-members-subcoleção)
   - 3.3 [auditLogs (subcoleção)](#33-auditlogs-subcoleção)
   - 3.4 [notifications (subcoleção franchise)](#34-notifications-subcoleção-franchise)
   - 3.5 [billingEvents (subcoleção)](#35-billingevents-subcoleção)
   - 3.6 [metrics (subcoleção franchise)](#36-metrics-subcoleção-franchise)
4. [Subcoleções de Loja (stores)](#4-subcoleções-de-loja-stores)
   - 4.1 [stores (documento)](#41-stores-documento)
   - 4.2 [products](#42-products)
   - 4.3 [orders](#43-orders)
   - 4.4 [payments](#44-payments)
   - 4.5 [dispensers](#45-dispensers)
   - 4.6 [settings (subcoleção loja)](#46-settings-subcoleção-loja)
   - 4.7 [inventoryLogs](#47-inventorylogs)
   - 4.8 [hardware](#48-hardware)
   - 4.9 [devices](#49-devices)
   - 4.10 [dailyStats](#410-dailystats)
   - 4.11 [metrics (subcoleção loja)](#411-metrics-subcoleção-loja)
5. [ERP Operacional (Chopp/Torneiras)](#5-erp-operacional-chopptorneiras)
   - 5.1 [taps](#51-taps)
   - 5.2 [kegs](#52-kegs)
   - 5.3 [tapAssignments](#53-tapassignments)
   - 5.4 [servingSessions](#54-servingsessions)
   - 5.5 [wastageEvents](#55-wastageevents)
   - 5.6 [maintenanceLogs](#56-maintenancelogs)
   - 5.7 [notifications (subcoleção loja)](#57-notifications-subcoleção-loja)
6. [CRM / Comercial](#6-crm--comercial)
   - 6.1 [customers](#61-customers)
   - 6.2 [deals](#62-deals)
   - 6.3 [activities (subcoleção de deals)](#63-activities-subcoleção-de-deals)
   - 6.4 [calendarItems](#64-calendaritems)
   - 6.5 [commercialEvents](#65-commercialevents)
   - 6.6 [quotes](#66-quotes)
7. [Financeiro](#7-financeiro)
   - 7.1 [accounts](#71-accounts)
   - 7.2 [categories](#72-categories)
   - 7.3 [costCenters](#73-costcenters)
   - 7.4 [parties](#74-parties)
   - 7.5 [ledger](#75-ledger)
   - 7.6 [invoices](#76-invoices)
   - 7.7 [bills](#77-bills)
   - 7.8 [finPayments](#78-finpayments)
   - 7.9 [financeSummary](#79-financesummary)
8. [Coleções de Migração](#8-coleções-de-migração)
9. [Collection Group Queries](#9-collection-group-queries)
10. [Indexes Compostos](#10-indexes-compostos)

### Parte II — Armazenamento Local (Browser / Dispositivo)
11. [Visão Geral do Armazenamento Local](#11-visão-geral-do-armazenamento-local)
12. [Firestore Offline Cache (SDK)](#12-firestore-offline-cache-sdk)
13. [IndexedDB — kiosk_cache](#13-indexeddb--kiosk_cache)
    - 13.1 [settings (store)](#131-settings-store)
    - 13.2 [products (store)](#132-products-store)
    - 13.3 [videos (store)](#133-videos-store)
    - 13.4 [syncQueue (store)](#134-syncqueue-store)
    - 13.5 [syncDLQ (store)](#135-syncdlq-store)
    - 13.6 [taps (store)](#136-taps-store)
    - 13.7 [failedDispenses (store)](#137-faileddispenses-store)
14. [Cache API — kiosk-video-cache-v1](#14-cache-api--kiosk-video-cache-v1)
15. [localStorage — Chaves do Kiosk](#15-localstorage--chaves-do-kiosk)
16. [localStorage — Chaves do Admin](#16-localstorage--chaves-do-admin)
17. [Limpeza Automática (Cleanup)](#17-limpeza-automática-cleanup)

### Parte III — Resumos  
18. [Matriz Coleção × Consumidor (Firestore)](#18-matriz-coleção--consumidor-firestore)
19. [Fluxo Offline-First (Kiosk)](#19-fluxo-offline-first-kiosk)
20. [Notas Importantes](#20-notas-importantes)

---

# PARTE I — ARMAZENAMENTO REMOTO (FIREBASE)

## 1. Visão Geral da Hierarquia Firestore

**Banco:** Google Cloud Firestore (NoSQL, Document-based)  
**Projeto:** Configurado via `VITE_FIREBASE_*` (env vars)  
**Persistência Local (SDK):** `persistentLocalCache` + `persistentMultipleTabManager` + `CACHE_SIZE_UNLIMITED`

```
Firestore (root)
├── superadmins/{userId}                                  ← Apenas Functions
├── users/{userId}                                        ← Auth global
├── invitations/{inviteId}                                ← Convites pendentes
├── audit_logs/{logId}                                    ← Legado (global)
├── settings/{settingId}                                  ← Config global
├── analytics/
│   ├── daily/{YYYY-MM-DD}                                ← Agregados diários
│   └── hourly/{YYYY-MM-DD-HH}                            ← Agregados horários
│
├── franchises/{franchiseId}                              ← Dados da franquia
│   ├── members/{userId}                                  ← Equipe/RBAC
│   ├── auditLogs/{logId}                                 ← Auditoria franchise
│   ├── notifications/{notifId}                           ← Alertas franchise
│   ├── billingEvents/{eventId}                           ← Histórico billing
│   ├── metrics/{metricId}                                ← KPIs franchise
│   ├── financeSummary/{periodId}                         ← Resumo financeiro consolidado
│   │
│   └── stores/{storeId}                                  ← Configuração da loja
│       ├── products/{productId}                          ← Catálogo
│       ├── orders/{orderId}                              ← Vendas/Pedidos
│       ├── payments/{paymentId}                          ← Pagamentos
│       ├── dispensers/{dispenserId}                       ← Config torneiras (HW)
│       ├── settings/{settingId}                          ← Config avançada loja
│       ├── inventoryLogs/{logId}                         ← Movimentações estoque
│       ├── hardware/{docId}                              ← Status ESP32
│       ├── devices/{deviceId}                            ← Heartbeat dispositivos
│       ├── dailyStats/{dateId}                           ← Stats diárias
│       ├── metrics/{metricId}                            ← KPIs loja
│       │
│       │  ── ERP Operacional (Chopp) ──
│       ├── taps/{tapId}                                  ← Estado das torneiras
│       ├── kegs/{kegId}                                  ← Barris
│       ├── tapAssignments/{assignmentId}                 ← Histórico tap↔keg
│       ├── servingSessions/{eventId}                     ← Log de dispensação
│       ├── wastageEvents/{wastageId}                     ← Registro de perdas
│       ├── maintenanceLogs/{logId}                       ← Manutenção
│       ├── notifications/{notifId}                       ← Alertas operacionais
│       │
│       │  ── CRM / Comercial ──
│       ├── customers/{customerId}                        ← Clientes B2B/B2C
│       ├── deals/{dealId}                                ← Negociações (pipeline)
│       │   └── activities/{activityId}                   ← Atividades do deal
│       ├── calendarItems/{itemId}                        ← Agenda comercial
│       ├── commercialEvents/{eventId}                    ← Eventos/feiras
│       │   └── budgetLines/{lineId}                      ← Orçamento do evento
│       ├── quotes/{quoteId}                              ← Propostas comerciais
│       │   └── lines/{lineId}                            ← Itens da proposta
│       │
│       │  ── Financeiro ──
│       ├── finAccounts/{accountId}                       ← Contas bancárias/caixa
│       ├── finCategories/{categoryId}                    ← Categorias financeiras
│       ├── finCostCenters/{centerId}                     ← Centros de custo
│       ├── finParties/{partyId}                          ← Fornecedores/clientes fin.
│       ├── finLedger/{entryId}                           ← Lançamentos financeiros
│       ├── finInvoices/{invoiceId}                       ← Contas a receber
│       │   └── lines/{lineId}                            ← Itens da fatura
│       ├── finBills/{billId}                             ← Contas a pagar
│       └── finPayments/{paymentId}                       ← Pagamentos financeiros
│
└── migrations/                                           ← Logs de migração
    ├── paymentGatewayConfig/{runId}/stores/{sId}
    └── unifyStoreSettings/{runId}/stores/{compositeId}
```

**RBAC (8 roles):** `superadmin > owner > admin > manager > operator > employee > technician > viewer`  
Definidos em `shared/types/roles.ts` e `shared/types/permissions.ts`.

---

## 2. Coleções Globais (Raiz)

### 2.1 `superadmins`

**Path:** `superadmins/{userId}`  
**Descrição:** Registro de super administradores da plataforma.  
**Imutabilidade:** Escrita apenas via Cloud Functions (Admin SDK).

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `email` | `string` | ✅ | Email do superadmin |
| `displayName` | `string` | ❌ | Nome de exibição |
| `createdAt` | `Timestamp` | ✅ | Data de criação |
| `promotedBy` | `string` | ❌ | UID de quem promoveu |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | `isSuperAdmin()` |
| Write | `❌ Bloqueado` (apenas Admin SDK) |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| Functions | `auth/onCreate.ts` | R | `onUserCreated` — verifica se novo user é superadmin |
| Functions | `auth/claims.ts` | R | `setAdminClaims` — verifica permissão do caller |
| Functions | `analytics/aggregateDailySales.ts` | R | `aggregateDailySalesHTTP` — verifica permissão |
| Functions | `analytics/getMetricsAdmin.ts` | R | `getMetricsAdmin` — verifica permissão |
| Functions | `superadmin/setSuperAdmin.ts` | R, W, D | `setSuperAdmin`, `removeSuperAdmin`, `listSuperAdmins` |
| Functions | `superadmin/promoteSuperAdminHTTP.ts` | W | `promoteSuperAdminHTTP` |

---

### 2.2 `users`

**Path:** `users/{userId}`  
**Descrição:** Perfil global do usuário, sincronizado com Firebase Auth.  
**Schema:** `User` (definido em `src/types/franchise.ts`)

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | `string` | ✅ | UID do Firebase Auth |
| `email` | `string` | ✅ | Email do usuário |
| `displayName` | `string` | ❌ | Nome de exibição |
| `photoURL` | `string` | ❌ | URL da foto |
| `phone` | `string` | ❌ | Telefone |
| `defaultFranchiseId` | `string` | ❌ | Última franquia acessada |
| `defaultStoreId` | `string` | ❌ | Última loja acessada |
| `role` | `UserRole` | ❌ | Role sincronizado de claims |
| `franchiseId` | `string \| null` | ❌ | Franquia associada |
| `storeId` | `string \| null` | ❌ | Loja associada |
| `storeAccess` | `string[]` | ❌ | Lojas com acesso (claims) |
| `status` | `string` | ❌ | Status interno |
| `invitedBy` | `string` | ❌ | Quem convidou |
| `isActive` | `boolean` | ✅ | Ativo/desativado |
| `createdAt` | `Timestamp` | ✅ | Data de criação |
| `lastLoginAt` | `Timestamp` | ❌ | Último login |
| `updatedAt` | `Timestamp` | ❌ | Última atualização |
| `claimsSyncedAt` | `Timestamp` | ❌ | Última sync de claims |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU próprio UID |
| Create | Próprio UID (registro) |
| Update | SuperAdmin OU próprio UID |
| Delete | `❌ Bloqueado` |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `context/AuthContext.tsx` | W (setDoc merge) | `onAuthStateChanged` — atualiza `lastLoginAt` no login |
| **Admin** | `context/AuthContext.tsx` | W (setDoc) | `register()` — cria doc do usuário no registro |
| **Kiosk** | `services/authService.ts` | R, W | `buildAuthenticatedUser()`, `registerWithEmail()`, `updateLastLogin()` |
| **Kiosk** | `services/userService.ts` | R, W, D | `getUser()`, `getUserByEmail()`, `createUser()`, `updateUser()`, `deleteUser()`, `ensureUserDocument()` |
| Functions | `auth/onCreate.ts` | W | `onUserCreated` — cria doc do usuário automaticamente |
| Functions | `auth/claims.ts` | R, W | `syncMembershipClaims`, `getClaimsForUser` |
| Functions | `auth/setCustomClaims.ts` | R, W | `setCustomClaims` |
| Functions | `invitations/accept.ts` | R, W | `acceptInvitation` — atualiza franquia do user |
| Functions | `superadmin/setSuperAdmin.ts` | R, W | `setSuperAdmin`, `removeSuperAdmin` |
| Functions | `superadmin/promoteSuperAdminHTTP.ts` | R, W | `promoteSuperAdminHTTP` |

---

### 2.3 `invitations`

**Path:** `invitations/{inviteId}`  
**Descrição:** Convites pendentes para membros ingressarem em uma franquia.  
**Schema:** `Invitation` (definido em `src/types/franchise.ts`)

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | `string` | ✅ | ID do convite |
| `email` | `string` | ✅ | Email do convidado |
| `franchiseId` | `string` | ✅ | ID da franquia destino |
| `storeAccess` | `string[]` | ✅ | Lojas com acesso |
| `role` | `UserRole` | ✅ | Role que será atribuído |
| `invitedBy` | `string` | ✅ | UID de quem convidou |
| `status` | `'pending' \| 'accepted' \| 'expired' \| 'revoked'` | ✅ | Status do convite |
| `token` | `string` | ✅ | Token único para o link |
| `expiresAt` | `Timestamp` | ✅ | Data de expiração |
| `createdAt` | `Timestamp` | ✅ | Data de criação |
| `emailSentAt` | `Timestamp` | ❌ | Quando o email foi enviado |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | Autenticado + (email = próprio OU owner/admin da franquia) |
| Create | Autenticado + owner/admin da franquia |
| Update | Autenticado + (email = próprio OU owner/admin) |
| Delete | Autenticado + owner/admin da franquia |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `services/userService.ts` | R, W | `getInvitations()`, `createInvitation()`, `revokeInvitation()`, `acceptInvitation()`, `resendInvitation()` |
| **Admin** | `pages/public/InvitePage.tsx` | R | `loadInvite` — busca por token ou ID |
| **Admin** | `pages/users/InvitationsPage.tsx` | R, W | `queryFn`, `createInviteMutation`, `revokeInviteMutation` |
| **Admin** | `pages/team/TeamPage.tsx` | R, W | `queryFn (invitations)`, `createInviteMutation`, `revokeInviteMutation` |
| **Admin** | `pages/settings/SettingsPage.tsx` | R, D | `handleDeleteFranchise()` — deleta convites da franquia |
| **Kiosk** | `services/franchiseService.ts` | R, W, B | `createInvitation()`, `getInvitationByToken()`, `getPendingInvitation()`, `acceptInvitation()`, `revokeInvitation()`, `listPendingInvitations()`, `validateInviteToken()` |
| **Kiosk** | `pages/AcceptInvitePage.tsx` | R | Via `franchiseService.validateInviteToken()` |
| Functions | `auth/onCreate.ts` | R | `onUserCreated` — busca convites pendentes do email |
| Functions | `invitations/sendEmail.ts` | R, W | `sendInvitationEmail` — cria e marca `emailSentAt` |
| Functions | `invitations/accept.ts` | R, W | `acceptInvitation`, `validateInvitationToken` |

---

### 2.4 `audit_logs` (legado)

**Path:** `audit_logs/{logId}`  
**Descrição:** Logs de auditoria globais. **Legado** — versão canônica usa `franchises/{fId}/auditLogs`.

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `action` | `string` | ✅ | Ação realizada |
| `actorId` | `string` | ✅ | UID do ator |
| `franchiseId` | `string` | ✅ | Franquia relacionada |
| `targetId` | `string` | ❌ | ID do recurso afetado |
| `timestamp` | `Timestamp` | ✅ | Quando ocorreu |
| `details` | `Record<string, any>` | ❌ | Dados adicionais |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU owner/admin da franquia |
| Create | Qualquer autenticado |
| Update/Delete | `❌ Bloqueado (imutável)` |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `pages/audit/AuditPage.tsx` | L (onSnapshot) | Fallback legado quando franchise auditLogs falha |
| Functions | `auth/claims.ts` | W | `setAdminClaims` — grava log de mudança de claims |

---

### 2.5 `settings` (global)

**Path:** `settings/{settingId}`  
**Descrição:** Configurações globais da plataforma.

#### Documentos conhecidos

| Doc ID | Campos | Descrição |
|--------|--------|-----------|
| `default_currency` | `value: string` | Moeda padrão da plataforma |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | Qualquer autenticado |
| Write | SuperAdmin apenas |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Kiosk** | `hooks/useSettings.tsx` | R | `fetchCurrency()` — fallback legado para moeda |

---

### 2.6 `analytics`

**Path:** `analytics/{docType}/{docId}`  
**Descrição:** Métricas agregadas globais (escritas exclusivamente por Cloud Functions).

#### Sub-paths

| Path | Descrição |
|------|-----------|
| `analytics/daily/{YYYY-MM-DD}` | Agregados diários de vendas |
| `analytics/hourly/{YYYY-MM-DD-HH}` | Agregados por hora |

#### Campos (daily/hourly)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `totalOrders` | `number` | Total de pedidos |
| `totalRevenue` | `number` | Receita total |
| `ordersByStatus` | `map` | Contadores por status |
| `byStore` | `map` | Breakdown por loja |
| `updatedAt` | `Timestamp` | Última atualização |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin |
| Write | `❌ Bloqueado` (apenas Admin SDK) |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| Functions | `analytics/aggOrders.ts` | W (set merge) | `onOrderCreated`, `onOrderUpdated` — atualiza em tempo real |

---

## 3. Coleção `franchises`

### 3.1 `franchises` (documento)

**Path:** `franchises/{franchiseId}`  
**Descrição:** Dados cadastrais e configuração da franquia.  
**Schema:** `Franchise` (definido em `src/types/franchise.ts` e `admin/src/types/franchise.ts`)

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | `string` | ✅ | ID do documento |
| `name` | `string` | ✅ | Nome da franquia |
| `slug` | `string` | ✅ | Slug URL-friendly |
| `ownerId` | `string` | ✅ | UID do proprietário |
| `ownerEmail` | `string` | ❌ | Email do owner |
| `status` | `string` | ❌ | Status (ex: `active`) |
| `logoUrl` | `string` | ❌ | URL do logo |
| `primaryColor` | `string` | ❌ | Cor primária (#hex) |
| `plan` | `FranchisePlan` | ✅ | `'free' \| 'trial' \| 'starter' \| 'pro' \| 'enterprise'` |
| `maxStores` | `number` | ✅ | Limite de lojas |
| `maxUsersPerStore` | `number` | ✅ | Limite de usuários/loja |
| `billingStatus` | `BillingStatus` | ❌ | Legado — status de cobrança |
| `planStatus` | `BillingStatus` | ❌ | Status atual do plano |
| `trialEndsAt` | `Timestamp` | ❌ | Legado — fim do trial |
| `planExpiresAt` | `Timestamp` | ❌ | Data de expiração do plano |
| `stripeCustomerId` | `string` | ❌ | ID do cliente no Stripe |
| `stripeSubscriptionId` | `string` | ❌ | ID da assinatura Stripe |
| `features` | `string[]` | ✅ | Features habilitadas |
| `createdAt` | `Timestamp` | ✅ | Data de criação |
| `updatedAt` | `Timestamp` | ✅ | Última atualização |
| `updatedBy` | `string` | ❌ | Quem atualizou |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU owner (por ownerId) OU membro da franquia |
| Create | Qualquer autenticado |
| Update | SuperAdmin OU owner OU admin |
| Delete | SuperAdmin |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `context/FranchiseContext.tsx` | R | `loadFranchises()` — lista franquias do user |
| **Admin** | `services/billingService.ts` | R | `getFranchiseBilling()` |
| **Admin** | `services/userService.ts` | R | `acceptInvitation()` — valida franquia |
| **Admin** | `pages/settings/SettingsPage.tsx` | W, D | `handleSave()`, `handleDeleteFranchise()` |
| **Admin** | `pages/superadmin/SuperAdminDashboard.tsx` | R | `loadData` — lista todas as franquias |
| **Admin** | `pages/superadmin/FranchisesPage.tsx` | R, D | `loadFranchises`, `handleDelete` |
| **Admin** | `pages/superadmin/FranchiseDetailPage.tsx` | R, W | `loadFranchise`, `handleSave` |
| **Kiosk** | `services/franchiseService.ts` | R, W | `getFranchise()`, `getFranchiseBySlug()`, `getUserFranchises()`, `createFranchise()`, `updateFranchise()` |
| Functions | `billing/createCheckout.ts` | R, W | `createCheckoutSession` — lê/grava `stripeCustomerId` |
| Functions | `billing/stripeWebhook.ts` | R, W | `stripeWebhook` — atualiza plan/status |
| Functions | `analytics/getMetricsAdmin.ts` | R | `getMetricsAdmin` |
| Functions | `invitations/sendEmail.ts` | R | `sendInvitationEmail` — nome da franquia |
| Functions | `invitations/accept.ts` | R | `validateInvitationToken` — nome da franquia |
| Functions | `analytics/aggregateDailySales.ts` | R | Lista todas as franquias para agregação |
| Functions | `erp/*` (scheduled) | R | Lists all franchises for ERP processing |

---

### 3.2 `members` (subcoleção)

**Path:** `franchises/{franchiseId}/members/{userId}`  
**Descrição:** Membros da equipe da franquia com roles RBAC e controle de acesso a lojas.  
**Schema:** `FranchiseMember` (definido em `src/types/franchise.ts`)

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `userId` | `string` | ✅ | UID do Firebase Auth (= docId) |
| `email` | `string` | ✅ | Email do membro |
| `displayName` | `string` | ❌ | Nome de exibição |
| `role` | `UserRole` | ✅ | `superadmin \| owner \| admin \| manager \| operator \| employee \| technician \| viewer` |
| `storeAccess` | `string[]` | ✅ | `['*']` (todas) ou IDs específicos |
| `permissions` | `Permission[]` | ❌ | Permissões customizadas (override do role) |
| `invitedBy` | `string` | ✅ | UID de quem convidou |
| `invitedAt` | `Timestamp` | ✅ | Data do convite |
| `joinedAt` | `Timestamp` | ❌ | Data que aceitou |
| `isActive` | `boolean` | ✅ | Membro ativo/desativado |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU próprio UID OU membro da franquia OU `resource.data.userId == uid` (collectionGroup) |
| Create | SuperAdmin OU owner/admin |
| Update | SuperAdmin OU owner/admin (não pode alterar próprio role) |
| Delete | SuperAdmin OU owner/admin (não pode remover a si mesmo) |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `context/FranchiseContext.tsx` | R (collectionGroup) | `loadFranchises()` — busca memberships do user |
| **Admin** | `services/userService.ts` | R, W | `getFranchiseMembers()`, `updateMemberRole()`, `removeMember()` |
| **Admin** | `services/userService.ts` | R, W | `acceptInvitation()` — cria/atualiza membership |
| **Admin** | `pages/users/UsersPage.tsx` | R, W, D | `loadMembers`, `changeRole`, `removeMember` |
| **Admin** | `pages/users/UserDetailPage.tsx` | R, W, D | `loadUser`, `handleSave`, `handleDelete` |
| **Admin** | `pages/team/TeamPage.tsx` | R, W, D | `queryFn (members)`, `changeRoleMutation`, `removeMemberMutation` |
| **Admin** | `pages/profile/ProfilePage.tsx` | R, W | `loadProfile`, `handleSaveProfile()` |
| **Admin** | `pages/dashboard/FranchiseOverview.tsx` | R | `fetchMetrics` — conta membros |
| **Admin** | `pages/superadmin/*` | R | Dashboard, FranchisesPage, FranchiseDetailPage |
| **Admin** | `pages/settings/SettingsPage.tsx` | R, D | `handleDeleteFranchise()` |
| **Kiosk** | `services/franchiseService.ts` | R, W, B | `getMembership()`, `listMembers()`, `updateMemberRole()`, `removeMember()`, `addCustomPermissions()`, `removeCustomPermissions()`, `acceptInvitation()`, `createFranchise()` |
| Functions | `auth/claims.ts` | R | `syncMembershipClaims` — lê role do membro |
| Functions | `analytics/getMetricsAdmin.ts` | R | `getMetricsAdmin` — verifica role |
| Functions | `payments/index.ts` | R | `createPayment` — verifica permissão |
| Functions | `invitations/accept.ts` | R, W | `acceptInvitation` — cria membership |

---

### 3.3 `auditLogs` (subcoleção)

**Path:** `franchises/{franchiseId}/auditLogs/{logId}`  
**Descrição:** Logs de auditoria por franquia (versão canônica, substitui `audit_logs` global).

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `action` | `string` | ✅ | Ex: `user.login`, `store.update` |
| `actor` | `object` | ✅ | `{ id: string, email: string, name?: string }` |
| `target` | `object` | ❌ | `{ type: string, id: string, name?: string }` |
| `details` | `Record<string, any>` | ❌ | Dados adicionais (before/after) |
| `timestamp` | `Timestamp` | ✅ | Quando ocorreu |
| `ip` | `string` | ❌ | IP do usuário |
| `userAgent` | `string` | ❌ | User agent |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU owner/admin |
| Create | Qualquer membro da franquia |
| Update/Delete | `❌ Bloqueado (imutável)` |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `services/auditService.ts` | R, W | `getAuditLogs()`, `createAuditLog()`, `logUserAction()`, `logStoreAction()`, `logSettingsChange()`, `logLogin()`, `logLogout()` |
| **Admin** | `pages/audit/AuditPage.tsx` | L (onSnapshot) | Listener em tempo real com filtros |
| **Admin** | `pages/settings/SettingsPage.tsx` | R, D | `handleDeleteFranchise()` — deleta auditLogs |
| Functions | `auth/claims.ts` | W | `setAdminClaims` — grava log de mudança de claims |

---

### 3.4 `notifications` (subcoleção franchise)

**Path:** `franchises/{franchiseId}/notifications/{notifId}`  
**Descrição:** Notificações in-app para gestores da franquia.

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | `string` | ✅ | ID do documento |
| `type` | `NotificationType` | ✅ | `'info' \| 'success' \| 'warning' \| 'error' \| 'order' \| 'stock' \| 'hardware' \| 'payment' \| 'system'` |
| `priority` | `NotificationPriority` | ✅ | `'low' \| 'normal' \| 'high' \| 'critical'` |
| `title` | `string` | ✅ | Título |
| `message` | `string` | ✅ | Corpo |
| `isRead` | `boolean` | ✅ | Lida ou não |
| `isDismissed` | `boolean` | ✅ | Descartada ou não |
| `createdAt` | `Timestamp` | ✅ | Criação |
| `readAt` | `Timestamp` | ❌ | Quando foi lida |
| `storeId` | `string` | ❌ | Loja origem |
| `storeName` | `string` | ❌ | Nome da loja |
| `orderId` | `string` | ❌ | Pedido relacionado |
| `productId` | `string` | ❌ | Produto relacionado |
| `actionUrl` | `string` | ❌ | URL de ação |
| `actionLabel` | `string` | ❌ | Label do botão |
| `metadata` | `Record<string, unknown>` | ❌ | Dados extras |
| `userId` | `string` | ❌ | Destinatário |
| `dedupeKey` | `string` | ❌ | Chave de deduplicação (Functions) |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU owner/admin OU membro da franquia |
| Create | SuperAdmin OU owner/admin |
| Update | Owner/admin (full) OU membro (apenas `readAt`, `isRead`, `isDismissed`) |
| Delete | SuperAdmin OU owner/admin |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `services/notificationService.ts` | L, W, B, R, D | `startListening()`, `addNotification()`, `broadcastNotification()`, `markAsRead()`, `markAllAsRead()`, `dismiss()`, `dismissAll()`, `cleanupOldNotifications()` |
| Functions | `payments/onPaymentUpdated.ts` | R, W | `onPaymentUpdated` — notifica mudança de status |
| Functions | `erp/onServingSessionCreated.ts` | R, W | `onServingSessionCreated` — notifica keg_low |
| Functions | `erp/checkKegLevels.ts` | R, W | `checkKegLevels` — notifica keg_low, keg_expiring |
| Functions | `erp/checkMaintenanceOverdue.ts` | R, W | `checkMaintenanceOverdue` — notifica maintenance_overdue |
| Functions | `erp/cleanupOldNotifications.ts` | R, D | `cleanupOldNotifications` — remove antigas lidas |

---

### 3.5 `billingEvents` (subcoleção)

**Path:** `franchises/{franchiseId}/billingEvents/{eventId}`  
**Descrição:** Histórico de eventos de cobrança e faturas (imutável).

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `eventType` | `string` | ✅ | Tipo do evento Stripe |
| `amount` | `number` | ❌ | Valor cobrado |
| `currency` | `string` | ❌ | Moeda |
| `status` | `string` | ❌ | Status (paid, failed, etc.) |
| `invoiceUrl` | `string` | ❌ | URL da fatura |
| `periodStart` | `Timestamp` | ❌ | Início do período |
| `periodEnd` | `Timestamp` | ❌ | Fim do período |
| `stripeEventId` | `string` | ❌ | ID do evento Stripe |
| `timestamp` | `Timestamp` | ✅ | Quando ocorreu |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU owner/admin |
| Create | SuperAdmin OU owner |
| Update/Delete | `❌ Bloqueado (imutável)` |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `services/billingService.ts` | R | `getBillingHistory()` |
| Functions | `billing/stripeWebhook.ts` | W | `stripeWebhook` — grava eventos |

---

### 3.6 `metrics` (subcoleção franchise)

**Path:** `franchises/{franchiseId}/metrics/{metricId}`  
**Descrição:** KPIs materializados no nível da franquia (apenas Admin SDK).

#### Documentos conhecidos: `current`, `operational`

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| Functions | `analytics/aggOrders.ts` | W | `onOrderCreated`, `onOrderUpdated` |
| Functions | `analytics/getMetricsAdmin.ts` | R | `getMetricsAdmin` |
| Functions | `erp/aggregateOperationalDaily.ts` | W | Métricas ERP diárias |

---

## 4. Subcoleções de Loja (`stores`)

### 4.1 `stores` (documento)

**Path:** `franchises/{franchiseId}/stores/{storeId}`  
**Descrição:** Configuração completa da loja — ponto central do sistema.  
**Schema:** `Store` (`shared/types/store.ts`) + `StoreSchema` (Zod em `shared/schemas/store.schema.ts`)

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | `string` | ✅ | ID do documento |
| `franchiseId` | `string` | ✅ | Franquia pai |
| `slug` | `string` | ✅ | URL-friendly (`^[a-z0-9-]+$`) |
| `name` | `string` | ✅ | Nome de exibição |
| `isActive` | `boolean` | ✅ | Ativa/inativa |
| **Localização** | | | |
| `address` | `StoreAddress` | ❌ | `{ street, number, complement?, neighborhood, city, state, zipCode, country }` |
| `contact` | `StoreContact` | ❌ | `{ phone, email, website? }` |
| `phone` | `string` | ❌ | Atalho telefone |
| `email` | `string` | ❌ | Atalho email |
| `timezone` | `string` | ✅ | Ex: `'America/Sao_Paulo'` |
| **Fiscal** | | | |
| `taxId` | `string` | ❌ | CNPJ |
| `currency` | `string` | ✅ | `'BRL'` (3 chars) |
| `taxPercentage` | `number` | ✅ | 0-100 |
| **Interface** | | | |
| `language` | `'pt-BR' \| 'en'` | ✅ | Idioma |
| `attractTimeoutSeconds` | `number` | ✅ | 10-600 |
| `useThermalPrinter` | `boolean` | ✅ | Impressora térmica |
| **Kiosk** | | | |
| `kioskEnabled` | `boolean` | ❌ | Modo kiosk ativo |
| `attractScreenEnabled` | `boolean` | ❌ | Tela de atração |
| `attractVideoConfig` | `AttractVideoConfig` | ❌ | `{ isEnabled, videoUrl?, displayTitle?, displaySubtitle?, videoOpacity?, videoCoverMode?, lastValidatedAt?, lastValidationResult?, contentType? }` |
| **Legado** | | | |
| `kioskMode` | `boolean` | ❌ | @deprecated → `kioskEnabled` |
| `idleTimeout` | `number` | ❌ | @deprecated → `attractTimeoutSeconds` |
| `_migrationVersion` | `number` | ❌ | Controle de migração |
| **Hardware** | | | |
| `esp32Config` | `ESP32Config` | ❌ | `{ connectionType, connectionId?, lastSeen?, firmwareVersion?, ipAddress?, comPort? }` |
| `comPort` | `string` | ❌ | Porta COM legada |
| `paymentGatewayConfig` | `PaymentGatewayConfig` | ❌ | Ver sub-objeto abaixo |
| `taps` | `TapConfig[]` | ❌ | Array com até 4 torneiras configuradas |
| `tapsVersion` | `number` | ❌ | Versão da config de taps |
| `tapsUpdatedAt` | `Timestamp` | ❌ | Última atualização de taps |
| `tapsUpdatedBy` | `string` | ❌ | Quem atualizou taps |
| **Kiosk Settings Extras** | | | |
| `esp32AutoConnect` | `boolean` | ❌ | Auto-conexão ESP32 |
| `esp32ConnectionOrder` | `string[]` | ❌ | Ordem de conexão |
| `esp32HeartbeatIntervalMs` | `number` | ❌ | Intervalo de heartbeat |
| `esp32LastWifiIp` | `string` | ❌ | Último IP WiFi |
| `drinkPickupTimeoutSeconds` | `number` | ❌ | Timeout retirada |
| `drinkPickupSoundEnabled` | `boolean` | ❌ | Som de confirmação |
| **Metadados** | | | |
| `createdAt` | `Timestamp` | ✅ | Criação |
| `updatedAt` | `Timestamp` | ✅ | Atualização |
| `createdBy` | `string` | ❌ | Quem criou |

#### PaymentGatewayConfig (sub-objeto)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `provider` | `'none' \| 'mercado_pago' \| 'pagbank'` | Provedor ativo |
| `environment` | `'sandbox' \| 'production'` | Ambiente |
| `enabledMethods` | `{ cash, pix, credit, debit }` (booleans) | Métodos habilitados |
| `pixKey` | `string` | Chave PIX |
| `providers.pagbank` | `{ clientId?, merchantId?, publicKey? }` | Config PagBank |
| `providers.mercadopago` | `{ userId?, storeId?, externalPosId?, terminalId? }` | Config MercadoPago |

#### TapConfig (sub-objeto, array de até 4)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `number` | 0-3 |
| `name` | `string` | Nome da torneira |
| `enabled` | `boolean` | Ativa/inativa |
| `valvePin` | `number` | GPIO da válvula |
| `sensorPin` | `number` | GPIO do sensor |
| `calibration` | `{ pulsesPerLiter?, mlPerSecond? }` | Calibração |
| `productId` | `string` | Produto vinculado |
| `productName` | `string` | Nome do produto |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU owner OU membro com acesso à loja |
| Create | SuperAdmin OU owner/admin |
| Update | SuperAdmin OU owner/admin/manager |
| Delete | SuperAdmin OU owner |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `services/storeService.ts` | R, W, D | `getStores()`, `getStore()`, `createStore()`, `updateStore()`, `deleteStore()`, etc. |
| **Admin** | `hooks/useStoreDetail.ts` | R | `loadStore()` |
| **Admin** | `hooks/useMaxTaps.ts` | R | Lê campo `taps` |
| **Admin** | `hooks/useTapAssignments.ts` | R | Lê store doc para config de taps |
| **Admin** | `pages/stores/*` | R, W, D | StoreDetailPage, StoreOverviewPage, StoresPage, StoreCreatePage |
| **Admin** | `context/FranchiseContext.tsx` | R | `loadStores()` |
| **Admin** | `pages/superadmin/*` | R | Dashboard, FranchisesPage, FranchiseDetailPage |
| **Kiosk** | `services/storeService.ts` | R, W | `getStore()`, `createStore()`, `updateStore()`, `getAllStores()`, `getActiveStores()`, `ensureStoreExists()` |
| **Kiosk** | `services/storeSettingsService.ts` | R, L | `getStoreSettings()`, `subscribeStoreSettings()` |
| **Kiosk** | `hooks/useStoreSettings.tsx` | L, W | `onSnapshot(storeDocRef)`, `syncToFirebase()` |
| **Kiosk** | `hooks/useTapConfiguration.ts` | L, W | `onSnapshot` (lê `taps`), `reportApplied()` |
| Functions | `payments/index.ts` | R | Lê config de pagamento |
| Functions | `erp/*`, `analytics/*` | R | Lista stores para processamento |
| Functions | `migrations/*` | R, W | Migração de settings |

---

### 4.2 `products`

**Path:** `franchises/{fId}/stores/{sId}/products/{productId}`  
**Descrição:** Catálogo de produtos da loja.  
**Schema:** `Product` (`src/types/product.ts`)

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | `string` | ✅ | ID do produto |
| `title` | `string` | ✅ | Nome |
| `price` | `number` | ✅ | Preço unitário |
| `description` | `string` | ✅ | Descrição |
| `image` | `string` | ❌ | URL da imagem |
| `tags` | `string[]` | ✅ | Tags |
| `inStock` | `boolean` | ✅ | Em estoque |
| `category` | `string` | ✅ | Categoria |
| `stock` | `number` | ✅ | Quantidade |
| `minStock` | `number` | ❌ | Estoque mínimo |
| `isDrink` | `boolean` | ❌ | É bebida (chopp) |
| `sizes` | `ProductSize[]` | ❌ | `[{ key, label, price, ml }]` |
| `defaultSizeKey` | `string` | ❌ | Tamanho padrão |
| `totalMlAvailable` | `number` | ❌ | ML disponíveis (bebidas) |
| `storeId` | `string` | ❌ | ID da loja |
| `createdAt` | `Timestamp` | ❌ | Criação |
| `updatedAt` | `Timestamp` | ❌ | Atualização |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU owner OU membro com acesso |
| Create | SuperAdmin OU owner/admin/manager |
| Update | Owner/admin/manager (full) OU operador (apenas `stock`, `inStock`, `totalMlAvailable`, `updatedAt`) |
| Delete | SuperAdmin OU owner/admin |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `hooks/useKegs.ts` | R | Lista para associar barril→produto |
| **Kiosk** | `hooks/useFirebaseProducts.tsx` | R, W, L, D | `setupSubscription()` (onSnapshot), `addProduct()`, `updateProduct()`, `deleteProduct()` |
| **Kiosk** | `services/salesService.ts` | R, T | `recordSaleAndUpdateStock()` — decrementa estoque em transação |
| **Kiosk** | `services/productCacheService.ts` | — | Cache local (ver IndexedDB + localStorage) |
| Functions | `cleanup/onDeleteStore.ts` | D | Deleta ao excluir loja |

---

### 4.3 `orders`

**Path:** `franchises/{fId}/stores/{sId}/orders/{orderId}`  
**Descrição:** Registro de vendas e pedidos — principal tabela de transações.

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `orderNumber` | `string` | ✅ | Número legível (ex: `250214120530-a1b2c3d4`) |
| `storeId` | `string` | ✅ | ID da loja |
| `franchiseId` | `string` | ❌ | ID da franquia |
| `deviceId` | `string` | ❌ | ID do kiosk |
| `status` | `OrderStatus` | ✅ | `'pending' \| 'paid_pending_dispense' \| 'dispensing' \| 'completed' \| 'failed_dispense' \| 'compensation_pending' \| 'compensated'` |
| `paymentStatus` | `PaymentStatus` | ✅ | `'pending' \| 'paid' \| 'failed' \| 'canceled' \| 'expired' \| 'refunded' \| 'paid_pending_dispense' \| 'dispensed' \| 'failed_needs_compensation'` |
| `paymentMethod` | `PaymentMethod` | ✅ | `'pix_qr' \| 'credit_card' \| 'debit_card' \| 'mercadopago_qr' \| 'mercadopago_point' \| 'cash' \| 'unknown'` |
| `dispenseStatus` | `DispenseStatus` | ❌ | `'pending' \| 'dispensing' \| 'dispensed' \| 'failed' \| 'failed_dispense'` |
| `items` | `OrderItem[]` | ✅ | `[{ productId, title, price, quantity, total, sizeKey?, sizeLabel?, mlPerUnit? }]` |
| `total` | `number` | ❌ | Total calculado |
| `timestamp` | `Timestamp` | ✅ | Criação |
| `date` | `string` | ✅ | `YYYY-MM-DD` |
| `hourOfDay` | `number` | ✅ | 0-23 |
| `dayOfWeek` | `number` | ✅ | 0=Sunday |
| `timeSlot` | `string` | ✅ | `'morning' \| 'afternoon' \| 'evening' \| 'night'` |
| `isWeekend` | `boolean` | ✅ | Fim de semana |
| `isHoliday` | `boolean` | ❌ | Feriado |
| `createdAt` | `Timestamp` | ✅ | serverTimestamp |
| `paidAt` | `Timestamp` | ❌ | Quando pago |
| `completedAt` | `Timestamp` | ❌ | Quando finalizado |
| `dispensedAt` | `Timestamp` | ❌ | Quando dispensado |
| `cancelledAt` | `Timestamp` | ❌ | Quando cancelado |
| `refundedAt` | `Timestamp` | ❌ | Quando estornado |
| `notes` | `string` | ❌ | Observações |
| `lastSync` | `Timestamp` | ❌ | Última sincronização |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU owner OU membro com acesso |
| Create | SuperAdmin OU owner OU membro com acesso |
| Update | SuperAdmin OU owner/admin — apenas: `status`, `paymentStatus`, `cancelledAt`, `refundedAt`, `notes`, `updatedAt` |
| Delete | `❌ Bloqueado (audit trail)` |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `services/orderService.ts` | W | `cancelOrder()`, `refundOrder()` |
| **Admin** | `services/reportService.ts` | R | `getSalesReport()`, `getProductReport()`, `getStoreReport()` |
| **Admin** | `pages/reports/ReportsPage.tsx` | R | `loadReport` — paginação |
| **Admin** | `pages/dashboard/FranchiseOverview.tsx` | R | `fetchMetrics` |
| **Kiosk** | `services/salesService.ts` | W, T | `recordSaleAndUpdateStock()` — cria em transação |
| **Kiosk** | `services/salesService.ts` | W | `updateOrderDispenseStatus()` |
| **Kiosk** | `services/dispenseRecoveryService.ts` | W | `reconcileOnStartup()` — via salesService |
| **Kiosk** | `hooks/useReports.tsx` | R | `getTodayStats()`, `getSalesReportByDateRange()` |
| Functions | `analytics/aggOrders.ts` | R (trigger) | `onOrderCreated`, `onOrderUpdated` |
| Functions | `analytics/aggregateDailySales.ts` | R | Queries por timestamp |
| Functions | `cleanup/onDeleteStore.ts` | D | Deleta ao excluir loja |

---

### 4.4 `payments`

**Path:** `franchises/{fId}/stores/{sId}/payments/{paymentId}`  
**Descrição:** Registros de pagamento criados via Cloud Functions (provedor externo).  
**Schema:** `PaymentRecord` (`src/types/payments.ts`)

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | `string` | ✅ | ID do pagamento |
| `provider` | `string` | ✅ | `'mercado_pago' \| 'pagbank'` |
| `method` | `PaymentMethod` | ✅ | `'pix' \| 'credit' \| 'debit'` |
| `status` | `PaymentStatus` | ✅ | Status atual |
| `amount` | `number` | ✅ | Valor em centavos |
| `currency` | `string` | ✅ | Moeda |
| `orderId` | `string` | ❌ | Order vinculada |
| `pix` | `PaymentPixPayload` | ❌ | `{ qrCodeText?, qrCodeImage?, expiresAt? }` |
| `providerOrderId` | `string` | ❌ | ID no provedor |
| `providerPaymentId` | `string` | ❌ | ID do pagamento no provedor |
| `createdAt` | `Timestamp` | ✅ | Criação |
| `updatedAt` | `Timestamp` | ❌ | Atualização |
| `error` | `string` | ❌ | Mensagem de erro |

#### Regras de Segurança

| Operação | Permissão |
|----------|-----------|
| Read | SuperAdmin OU owner OU membro com acesso |
| Write | `❌ Bloqueado` (apenas Admin SDK/Functions) |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Kiosk** | `services/paymentService.ts` | L, W | `watchPaymentStatus()` (onSnapshot), `cancelPagBankPayment()` |
| Functions | `payments/index.ts` | R, W | `createPayment`, `pagbankWebhook`, `cancelPagBankPayment`, `syncPendingPayments` |
| Functions | `payments/onPaymentUpdated.ts` | R (trigger) | `onPaymentUpdated` |
| Functions | `cleanup/onDeleteStore.ts` | D | Deleta ao excluir loja |

---

### 4.5 `dispensers`

**Path:** `franchises/{fId}/stores/{sId}/dispensers/{dispenserId}`  
**Descrição:** Configuração de hardware das torneiras (mapeamento físico ESP32).

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | `string` | ✅ | ID |
| `name` | `string` | ✅ | Nome |
| `icon` | `string` | ✅ | Emoji |
| `color` | `string` | ✅ | Cor UI |
| `isActive` | `boolean` | ✅ | Ativo |
| `hardware` | `DispenserHardwareConfig` | ✅ | `{ deviceId, connectionType, valvePin, flowSensorPin, lastKnownIp? }` |
| `calibration` | `DispenserCalibration` | ✅ | `{ pulsesPerLiter, mlPerSecond }` |
| `allowedProductIds` | `string[]` | ✅ | Produtos permitidos |
| `lastStatus` | `object` | ❌ | `{ connected, lastSeen, firmwareVersion? }` |
| `createdAt` | `Timestamp` | ✅ | Criação |
| `updatedAt` | `Timestamp` | ✅ | Atualização |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Kiosk** | `services/dispenserService.ts` | R, W, D, L | CRUD + `subscribeToDispensers()` |
| **Kiosk** | `hooks/useDispensers.ts` | R, W, D, L | Via service |
| Functions | `cleanup/onDeleteStore.ts` | D | Cascading delete |

---

### 4.6 `settings` (subcoleção loja)

**Path:** `franchises/{fId}/stores/{sId}/settings/{settingId}`  
**Descrição:** Configurações avançadas/locais (docs individuais por categoria).

#### Documentos conhecidos

| Doc ID | Descrição |
|--------|-----------|
| `general` | Configurações gerais (criado pelo kiosk) |
| `config` | Config avançada sincronizada |
| `default_currency` | `{ value: string }` — Moeda padrão |
| `attract_video` | Legado → agora no store doc |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Kiosk** | `services/storeService.ts` | W | `createStore()` — cria `settings/general` |
| **Kiosk** | `hooks/useStoreSettings.tsx` | L, W | onSnapshot em `settings/config` |
| **Kiosk** | `hooks/useSettings.tsx` | R, W | Doc `settings/default_currency` |
| Functions | `migrations/unifyStoreSettings.ts` | R | Lê `settings/attract_video` |
| Functions | `cleanup/onDeleteStore.ts` | D | Cascading delete |

---

### 4.7 `inventoryLogs`

**Path:** `franchises/{fId}/stores/{sId}/inventoryLogs/{logId}`  
**Descrição:** Registro de movimentações de estoque (imutável).

#### Campos: `id`, `productId`, `productTitle`, `type` (`ADD|REMOVE|ADJUST`), `quantity`, `previousStock`, `newStock`, `userEmail`, `comment`, `timestamp`, `userId`

> ⚠️ Definida nas rules e no pathResolver mas **sem consumo direto** encontrado nos services/components atuais.

---

### 4.8 `hardware`

**Path:** `franchises/{fId}/stores/{sId}/hardware/{docId}` (principal: `status`)  
**Descrição:** Status de hardware (ESP32, impressoras) reportado pelo Kiosk.

#### Campos (doc `status`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `esp32Connected` | `boolean` | ESP32 conectado |
| `lastHeartbeat` | `Timestamp` | Último heartbeat |
| `dispensersCount` / `dispensersOnline` | `number` | Dispensers total/online |
| `printerConnected` | `boolean` | Impressora conectada |
| `firmwareVersion`, `cpuTemp`, `wifiSignal`, `uptime` | diversos | Info de saúde |
| `errors` | `string[]` | Array de erros |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Kiosk** | `services/hardwareStatusService.ts` | W, L | `updateStatus()`, `subscribeToStatus()` |

---

### 4.9 `devices`

**Path:** `franchises/{fId}/stores/{sId}/devices/{deviceId}`  
**Descrição:** Heartbeat de dispositivos Kiosk (tablet/terminal).

#### Campos: `deviceId`, `lastSeen`, `isOnline`, `appVersion`, `platform`, `userAgent`

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Kiosk** | `services/deviceHeartbeatService.ts` | W | `sendHeartbeat()`, `markOffline()` |

---

### 4.10 `dailyStats`

**Path:** `franchises/{fId}/stores/{sId}/dailyStats/{dateId}`  
**Descrição:** Estatísticas diárias pré-agregadas (apenas Admin SDK).

#### Campos: `date`, `totalOrders`, `totalRevenue`, `averageTicket`, `ordersByPaymentMethod`, `ordersByTimeSlot`, `topProducts`, `updatedAt`

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `services/reportService.ts` | R | `getSalesReport()`, `getStoreReport()` |
| Functions | `analytics/aggregateDailySales.ts` | W | Scheduled 02h |
| Functions | `analytics/getMetricsAdmin.ts` | R | Stats |
| Functions | `erp/aggregateOperationalDaily.ts` | W (merge) | Métricas ERP |

---

### 4.11 `metrics` (subcoleção loja)

**Path:** `franchises/{fId}/stores/{sId}/metrics/{metricId}`  
**Descrição:** KPIs materializados da loja. Doc principal: `current`.

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `services/reportService.ts` | R | `getStoreReport()` fallback |
| Functions | `analytics/aggOrders.ts` | W | Triggers de order |
| Functions | `analytics/getMetricsAdmin.ts` | R | KPIs |

---

## 5. ERP Operacional (Chopp/Torneiras)

Path base: `franchises/{fId}/stores/{sId}/`  
Schemas Zod: `shared/schemas/operations.schema.ts`  
Types: `shared/types/operations.ts`

### 5.1 `taps`

**Path:** `…/taps/{tapId}`  
**Descrição:** Estado operacional de cada torneira (contadores diários, barril conectado).  
⚠️ **NÃO confundir** com `stores/{sId}.taps[]` (config de hardware ESP32 no store doc).

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `tapId` | `string` | ID da torneira |
| `status` | `'idle' \| 'active' \| 'disabled' \| 'maintenance'` | Status operacional |
| `currentKegId` | `string \| null` | Barril conectado |
| `todayMlDispensed` | `number` | ML dispensados hoje |
| `todaySessions` | `number` | Sessões hoje |
| `todayWastageMl` | `number` | ML perdidos hoje |
| `createdAt`, `createdBy`, `updatedAt`, `updatedBy` | Timestamp/string | Metadados |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `hooks/useTapAssignments.ts` | R, B, W | Query taps, connect/disconnect |
| **Admin** | `hooks/useTapsRealtime.ts` | L | onSnapshot em tempo real |
| **Kiosk** | `services/servingSessionService.ts` | R | Lookup de `currentKegId` |
| Functions | `erp/onServingSessionCreated.ts` | W | Atualiza contadores |
| Functions | `erp/onWastageEventCreated.ts` | W | Atualiza wastage |
| Functions | `erp/resetTapDailyCounters.ts` | R, W | Reset diário |
| Functions | `cleanup/onDeleteStore.ts` | D | Cascading delete |

---

### 5.2 `kegs`

**Path:** `…/kegs/{kegId}`  
**Descrição:** Barris de chopp — controle de estoque físico por litragem.

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `kegId` | `string` | ID |
| `productId` | `string` | Produto |
| `supplierId` | `string` | Fornecedor |
| `volumeMl` | `number` | Volume total |
| `remainingMl` | `number` | Volume restante |
| `status` | `'in_stock' \| 'tapped' \| 'depleted' \| 'returned'` | Status |
| `tapId` | `string \| null` | Torneira |
| `tappedAt`, `depletedAt` | `Timestamp \| null` | Datas |
| `batchCode`, `expiresAt`, `cost` | diversos | Lote, validade, custo |

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `hooks/useKegs.ts` | R, W | CRUD |
| **Admin** | `hooks/useTapAssignments.ts` | R, B | connect/disconnect |
| **Admin** | `hooks/useWastage.ts` | R | Lista barris conectados |
| Functions | `erp/onServingSessionCreated.ts` | R, W | Subtrai volume |
| Functions | `erp/onWastageEventCreated.ts` | R, W | Subtrai perda |
| Functions | `erp/checkKegLevels.ts` | R | Verifica níveis |

---

### 5.3 `tapAssignments`

**Path:** `…/tapAssignments/{assignmentId}`  
**Descrição:** Histórico de associações torneira ↔ barril.

#### Campos: `assignmentId`, `tapId`, `kegId`, `status` (`active|removed`), `attachedAt/By`, `removedAt/By`, `removalReason`, `totalMlDispensed`, `totalSessions`, `totalWastageMl`, metadados

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `hooks/useTapAssignments.ts` | R, B | Query ativos, connect/disconnect |
| Functions | `erp/onServingSessionCreated.ts` | R, W | Incrementa contadores |
| Functions | `erp/onWastageEventCreated.ts` | R, W | Incrementa wastage |

---

### 5.4 `servingSessions`

**Path:** `…/servingSessions/{eventId}`  
**Descrição:** Log IMUTÁVEL de cada copo servido. eventId = `${orderId}_t${tapId}_c${cupIndex}` (determinístico, idempotente).

#### Campos: `eventId`, `orderId`, `tapId`, `kegId`, `productId`, `cupIndex`, `targetMl`, `actualMl`, `startedAt`, `completedAt`, `createdAt`, `status` (`completed|error|canceled`), `errorCode`, `source` (`kiosk`), `franchiseId`, `storeId`

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Kiosk** | `services/servingSessionService.ts` | W, T | `persistSession()` — setDoc idempotente ou fila offline (ver IndexedDB §11.4) |
| Functions | `erp/onServingSessionCreated.ts` | R (trigger) | Atualiza kegs, taps, tapAssignments, detecta perdas |
| Functions | `erp/aggregateOperationalDaily.ts` | R | Agregação diária |
| Functions | `cleanup/onDeleteStore.ts` | D | Cascading delete |

---

### 5.5 `wastageEvents`

**Path:** `…/wastageEvents/{wastageId}`  
**Descrição:** Registro IMUTÁVEL de perdas/desperdício.

#### Campos: `id`, `type` (`foam|purge|spill|other|auto`), `tapId`, `kegId`, `mlLost`, `reason`, `source` (`admin|auto`), `createdAt`, `createdBy`, `franchiseId`, `storeId`

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `hooks/useWastage.ts` | R, W | Query events, create |
| Functions | `erp/onServingSessionCreated.ts` | W | Auto-cria quando `targetMl - actualMl > threshold` |
| Functions | `erp/onWastageEventCreated.ts` | R (trigger) | Atualiza kegs, taps, tapAssignments |
| Functions | `erp/aggregateOperationalDaily.ts` | R | Agregação |
| Functions | `cleanup/onDeleteStore.ts` | D | Cascading delete |

---

### 5.6 `maintenanceLogs`

**Path:** `…/maintenanceLogs/{logId}`  
**Descrição:** Registro de manutenção preventiva e corretiva.

#### Campos: `id`, `type` (`cleaning|calibration|repair|inspection|other`), `tapId`, `kegId`, `status` (`scheduled|overdue|completed|canceled`), `scheduledAt`, `performedAt`, `durationMinutes`, `notes`, metadados

#### Consumo

| App | Arquivo | Operação | Função |
|-----|---------|----------|--------|
| **Admin** | `hooks/useMaintenance.ts` | R, W | Schedule, complete, cancel |
| Functions | `erp/checkMaintenanceOverdue.ts` | R, W | Marca `overdue`, gera notificação |
| Functions | `cleanup/onDeleteStore.ts` | D | Cascading delete |

---

### 5.7 `notifications` (subcoleção loja)

**Path:** `…/notifications/{notifId}`  
**Descrição:** Notificações operacionais da loja (geradas por Functions).

#### Campos: `id`, `type` (`keg_low|keg_expiring|maintenance_overdue|tap_idle|wastage_high|system`), `severity` (`info|warning|critical`), `message`, `createdAt`, `readAt`, `entityRef`, `storeId`, `franchiseId`

> ⚠️ **Nota:** UI consome via `franchises/{fId}/notifications` (franchise-level). Store-level notifications são escritas por Functions e encaminhadas para franchise-level.

---

## 6. CRM / Comercial

Subcoleções sob `franchises/{franchiseId}/stores/{storeId}/` que sustentam o módulo de CRM e gestão comercial.

---

### 6.1 `customers`

**Path:** `franchises/{fId}/stores/{sId}/customers/{customerId}`
**Type:** `admin/src/types/commercial.ts → Customer`
**Descrição:** Cadastro de clientes B2B e B2C vinculados a uma loja.

#### Campos principais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string` | ID do documento |
| `type` | `'company' \| 'person'` | Tipo de cliente |
| `name` | `string` | Nome / razão social |
| `doc` | `string?` | CPF ou CNPJ |
| `phones` | `string[]` | Telefones |
| `emails` | `string[]` | Emails de contato |
| `address` | `CustomerAddress?` | Endereço (`street`, `city`, `state`, `zip`) |
| `source` | `CustomerSource?` | Origem: `instagram \| indicacao \| inbound \| outbound \| evento_passado` |
| `status` | `'active' \| 'archived'` | Status do cliente |
| `tags` | `string[]` | Tags de classificação |
| `ownerUserId` | `string` | UID do responsável |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

**Rules:** Leitura/escrita requer autenticação + role `manager` ou superior na loja.
**Indexes:** `status ↑, name ↑` (ver seção 10).

#### Consumidores

| Artefato | Tipo | Caminho |
|----------|------|---------|
| `useCustomers` | Hook | `admin/src/hooks/useCustomers.ts` |
| `CommercialCustomersTab` | UI Component | `admin/src/components/store/commercial/CommercialCustomersTab.tsx` |

---

### 6.2 `deals`

**Path:** `franchises/{fId}/stores/{sId}/deals/{dealId}`
**Type:** `admin/src/types/commercial.ts → Deal`
**Descrição:** Negociações do pipeline comercial, vinculadas a clientes.

#### Campos principais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string` | ID do documento |
| `title` | `string` | Título da negociação |
| `customerId` | `string` | ID do cliente |
| `stage` | `DealStage` | Estágio: `lead \| qualify \| proposal \| negotiation \| won \| lost` |
| `valueEstimate` | `number` | Valor estimado (R$) |
| `probability` | `number` | Probabilidade de fechamento (0–100) |
| `expectedCloseAt` | `Timestamp?` | Previsão de fechamento |
| `eventStartAt` | `Timestamp?` | Início do evento vinculado |
| `eventEndAt` | `Timestamp?` | Fim do evento vinculado |
| `nextActionAt` | `Timestamp?` | Data da próxima ação |
| `ownerUserId` | `string` | Vendedor responsável |
| `lostReason` | `string?` | Motivo da perda |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

**Rules:** Leitura/escrita requer autenticação + role `manager` ou superior na loja.
**Indexes:** `stage ↑, nextActionAt ↑` · `ownerUserId ↑, stage ↑, updatedAt ↓` (ver seção 10).

#### Consumidores

| Artefato | Tipo | Caminho |
|----------|------|---------|
| `useDeals` | Hook | `admin/src/hooks/useDeals.ts` |
| `CommercialPipelineTab` | UI Component | `admin/src/components/store/commercial/CommercialPipelineTab.tsx` |

---

### 6.3 `activities` (subcoleção de deals)

**Path:** `franchises/{fId}/stores/{sId}/deals/{dealId}/activities/{activityId}`
**Type:** `admin/src/types/commercial.ts → Activity`
**Descrição:** Registro de atividades (ligações, WhatsApp, emails, visitas, tarefas) vinculadas a um deal.

#### Campos principais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string` | ID do documento |
| `type` | `'call' \| 'whatsapp' \| 'email' \| 'visit' \| 'task'` | Tipo da atividade |
| `dueAt` | `Timestamp` | Prazo / data prevista |
| `doneAt` | `Timestamp?` | Data de conclusão |
| `status` | `'open' \| 'done' \| 'canceled'` | Status |
| `summary` | `string` | Resumo da atividade |
| `notes` | `string?` | Observações |
| `createdBy` | `string` | UID do criador |
| `createdAt` | `Timestamp` | Data de criação |

**Rules:** Leitura/escrita requer autenticação + role `manager` ou superior na loja.
**Indexes:** `status ↑, dueAt ↑` (ver seção 10).

> **Nota:** Activities ainda não possuem hook/UI dedicados — serão implementadas como submodelo de deals em PR futuro.

---

### 6.4 `calendarItems`

**Path:** `franchises/{fId}/stores/{sId}/calendarItems/{itemId}`
**Type:** `admin/src/types/commercial.ts → CalendarItem`
**Descrição:** Itens da agenda comercial (eventos, tarefas, lembretes, visitas).

#### Campos principais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string` | ID do documento |
| `type` | `'event' \| 'task' \| 'reminder' \| 'visit'` | Tipo do item |
| `title` | `string` | Título |
| `startAt` | `Timestamp` | Início |
| `endAt` | `Timestamp?` | Fim |
| `allDay` | `boolean` | Dia inteiro |
| `ownerUserId` | `string` | Responsável |
| `relatedType` | `'deal' \| 'customer' \| 'commercialEvent' \| 'quote'?` | Tipo do vínculo |
| `relatedId` | `string?` | ID do item vinculado |
| `status` | `'tentative' \| 'confirmed' \| 'canceled' \| 'done'` | Status |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

**Rules:** Leitura/escrita requer autenticação + role `manager` ou superior na loja.
**Indexes:** `ownerUserId ↑, startAt ↑` · `status ↑, startAt ↑` (ver seção 10).

#### Consumidores

| Artefato | Tipo | Caminho |
|----------|------|---------|
| `useCalendarItems` | Hook | `admin/src/hooks/useCalendarItems.ts` |
| `CommercialCalendarTab` | UI Component | `admin/src/components/store/commercial/CommercialCalendarTab.tsx` |

---

### 6.5 `commercialEvents`

**Path:** `franchises/{fId}/stores/{sId}/commercialEvents/{eventId}`
**Type:** `admin/src/types/commercial.ts → CommercialEvent`
**Descrição:** Eventos comerciais, feiras e ações promocionais com controle orçamentário.

#### Campos principais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento (gerado pelo Firestore) |
| `customerId` | `string` | ID do cliente vinculado (`customers/{id}`) |
| `dealId` | `string?` | Deal vinculado (`deals/{id}`) |
| `quoteId` | `string?` | Proposta vinculada (`quotes/{id}`) |
| `title` | `string` | Título do evento |
| `description` | `string?` | Descrição |
| `status` | `'draft' \| 'scheduled' \| 'confirmed' \| 'in_progress' \| 'done' \| 'canceled'` | Status |
| `locationType` | `'on_site' \| 'external'` | Tipo do local |
| `address` | `CustomerAddress?` | Endereço (se `external`) |
| `startAt` | `Timestamp` | Data/hora de início |
| `endAt` | `Timestamp?` | Data/hora de fim |
| `attendeesEstimate` | `number?` | Estimativa de participantes |
| `pricingModel` | `'per_liter' \| 'per_hour' \| 'package'?` | Modelo de precificação |
| `notesInternal` | `string?` | Notas internas |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

**Subcoleção:** `budgetLines/{lineId}` — linhas de orçamento do evento.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `type` | `'staff' \| 'transport' \| 'beverage' \| 'rental' \| 'fee' \| 'discount'` | Tipo da linha |
| `categoryId` | `string?` | Ref para `finCategories/{id}` |
| `qty` | `number` | Quantidade |
| `unitCost` | `number` | Custo unitário |
| `totalCost` | `number` | Custo total (qty × unitCost, calculado) |
| `supplierId` | `string?` | Fornecedor |
| `paidBy` | `'store' \| 'client' \| 'split'` | Quem paga |

**Rules:** Leitura/escrita requer autenticação + role `manager` ou superior na loja.
**Indexes:** `status ↑, startAt ↑` (ver seção 10).

#### Consumidores

| Artefato | Tipo | Caminho |
|----------|------|---------|
| `useCommercialEvents` | Hook | `admin/src/hooks/useCommercialEvents.ts` |
| `CommercialEventsTab` | UI Component | `admin/src/components/store/commercial/CommercialEventsTab.tsx` |

---

### 6.6 `quotes`

**Path:** `franchises/{fId}/stores/{sId}/quotes/{quoteId}`
**Type:** `admin/src/types/commercial.ts → Quote`
**Descrição:** Propostas comerciais enviadas a clientes, com itens detalhados e totais calculados.

#### Campos principais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento (gerado pelo Firestore) |
| `customerId` | `string` | ID do cliente vinculado (`customers/{id}`) |
| `dealId` | `string?` | Deal vinculado (`deals/{id}`) |
| `eventId` | `string?` | Evento vinculado (`commercialEvents/{id}`) |
| `status` | `'draft' \| 'sent' \| 'accepted' \| 'rejected' \| 'expired'` | Status |
| `validUntil` | `Timestamp?` | Validade da proposta |
| `subtotal` | `number` | Soma dos itens |
| `discounts` | `number` | Descontos aplicados |
| `fees` | `number` | Taxas adicionais |
| `total` | `number` | Total final (subtotal − discounts + fees) |
| `paymentTerms` | `string?` | Condições de pagamento |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

**Subcoleção:** `lines/{lineId}` — itens da proposta.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `type` | `'keg' \| 'service' \| 'transport' \| 'staff' \| 'package'` | Tipo do item |
| `description` | `string` | Descrição do item |
| `qty` | `number` | Quantidade |
| `unitPrice` | `number` | Preço unitário |
| `total` | `number` | Total da linha (qty × unitPrice, calculado) |
| `productId` | `string?` | Produto vinculado (`products/{id}`) |

**Rules:** Leitura/escrita requer autenticação + role `manager` ou superior na loja.
**Indexes:** `status ↑, createdAt ↓` (ver seção 10).

#### Consumidores

| Artefato | Tipo | Caminho |
|----------|------|---------|
| `useQuotes` | Hook | `admin/src/hooks/useQuotes.ts` |
| `CommercialQuotesTab` | UI Component | `admin/src/components/store/commercial/CommercialQuotesTab.tsx` |

---

## 7. Financeiro

Subcoleções flat sob `franchises/{franchiseId}/stores/{storeId}/` com prefixo `fin` que compõem o módulo financeiro da loja, mais `financeSummary` no nível de franquia.

---

### 7.1 `finAccounts`

**Path:** `franchises/{fId}/stores/{sId}/finAccounts/{accountId}`
**Type:** `admin/src/types/finance.ts → FinAccount`
**Descrição:** Contas bancárias, caixas PIX e clearing de cartão vinculados à loja.

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `name` | `string` | Nome da conta |
| `type` | `'cash' \| 'bank' \| 'pix' \| 'card_clearing'` | Tipo de conta |
| `currency` | `string` | Moeda (ex: `'BRL'`) |
| `openingBalance` | `number` | Saldo de abertura |
| `openingAt` | `Timestamp?` | Data de abertura |
| `status` | `'active' \| 'inactive'` | Status |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

#### Consumidores

| Consumidor | Arquivo | Uso |
|------------|---------|-----|
| `useFinAccounts` | `admin/src/hooks/useFinAccounts.ts` | CRUD completo + `activeAccounts`, `totalBalance` |
| `FinanceCashTab` | `admin/src/components/store/finance/FinanceCashTab.tsx` | Grid de cards de contas, criar/editar/excluir |
| `FinanceOverviewTab` | `admin/src/components/store/finance/FinanceOverviewTab.tsx` | KPI saldo total de contas |
| `FinanceReportsTab` | `admin/src/components/store/finance/FinanceReportsTab.tsx` | Mapa de nomes de contas |
| `FinanceSettingsTab` | `admin/src/components/store/finance/FinanceSettingsTab.tsx` | — (lida por aba separada) |

**Rules:** Leitura/escrita requer autenticação + role com permissão `finance:read`/`finance:write`.
**Indexes:** Nenhum composto adicional necessário (query por `name asc`).

---

### 7.2 `finCategories`

**Path:** `franchises/{fId}/stores/{sId}/finCategories/{categoryId}`
**Type:** `admin/src/types/finance.ts → FinCategory`
**Descrição:** Categorias financeiras (receita = `in`, despesa = `out`) para classificação de lançamentos.

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `direction` | `'in' \| 'out'` | Receita ou despesa |
| `name` | `string` | Nome da categoria |
| `parentId` | `string?` | Categoria pai (hierarquia) |
| `status` | `'active' \| 'inactive'` | Status |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

#### Consumidores

| Consumidor | Arquivo | Uso |
|------------|---------|-----|
| `useFinCategories` | `admin/src/hooks/useFinCategories.ts` | CRUD + `activeCategories`, `incomeCategories`, `expenseCategories` |
| `FinanceSettingsTab` | `admin/src/components/store/finance/FinanceSettingsTab.tsx` | Tabela de categorias, criar/editar/inativar |
| `FinanceCashTab` | `admin/src/components/store/finance/FinanceCashTab.tsx` | Select de categorias no LedgerDialog |
| `FinanceAPTab` | `admin/src/components/store/finance/FinanceAPTab.tsx` | Select de categorias no BillDialog |
| `FinanceReportsTab` | `admin/src/components/store/finance/FinanceReportsTab.tsx` | DRE por categorias, análise por categoria |

**Rules:** Leitura/escrita requer autenticação + role com permissão `finance:read`/`finance:write`.
**Indexes:** Nenhum composto adicional necessário (query por `name asc`).

---

### 7.3 `finCostCenters`

**Path:** `franchises/{fId}/stores/{sId}/finCostCenters/{centerId}`
**Type:** `admin/src/types/finance.ts → CostCenter`
**Descrição:** Centros de custo para alocação de despesas e receitas.

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `name` | `string` | Nome do centro de custo |
| `status` | `'active' \| 'inactive'` | Status |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

#### Consumidores

| Consumidor | Arquivo | Uso |
|------------|---------|-----|
| `useCostCenters` | `admin/src/hooks/useCostCenters.ts` | CRUD + `activeCostCenters` |
| `FinanceSettingsTab` | `admin/src/components/store/finance/FinanceSettingsTab.tsx` | Tabela de centros de custo, criar/editar/inativar |
| `FinanceAPTab` | `admin/src/components/store/finance/FinanceAPTab.tsx` | Select de centro de custo no BillDialog |

**Rules:** Leitura/escrita requer autenticação + role com permissão `finance:read`/`finance:write`.
**Indexes:** Nenhum composto adicional necessário (query por `name asc`).

---

### 7.4 `finParties`

**Path:** `franchises/{fId}/stores/{sId}/finParties/{partyId}`
**Type:** `admin/src/types/finance.ts → Party`
**Descrição:** Terceiros financeiros (fornecedores, clientes, funcionários) usados em lançamentos, faturas e contas.

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `type` | `'customer' \| 'supplier' \| 'employee' \| 'other'` | Tipo |
| `name` | `string` | Nome |
| `doc` | `string?` | CPF/CNPJ |
| `contacts` | `PartyContact[]` | Lista de contatos (`phone?`, `email?`) |
| `bankInfo` | `PartyBankInfo?` | Info bancária (`bankName?`, `agency?`, `account?`, `pixKey?`) |
| `customerId` | `string?` | Ref em `customers` (se for cliente comercial) |
| `status` | `'active' \| 'inactive'` | Status |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

#### Consumidores

| Consumidor | Arquivo | Uso |
|------------|---------|-----|
| `useParties` | `admin/src/hooks/useParties.ts` | CRUD + `activeParties`, `suppliers`, `employees` |
| `FinanceSettingsTab` | `admin/src/components/store/finance/FinanceSettingsTab.tsx` | Tabela de terceiros, criar/editar/excluir |
| `FinanceCashTab` | `admin/src/components/store/finance/FinanceCashTab.tsx` | Select de terceiros no LedgerDialog |
| `FinanceARTab` | `admin/src/components/store/finance/FinanceARTab.tsx` | Select de parties no InvoiceDialog + nome no grid |
| `FinanceAPTab` | `admin/src/components/store/finance/FinanceAPTab.tsx` | Select de parties no BillDialog + nome no grid |
| `FinanceOverviewTab` | `admin/src/components/store/finance/FinanceOverviewTab.tsx` | Mapa de nomes para itens vencidos |

**Rules:** Leitura/escrita requer autenticação + role com permissão `finance:read`/`finance:write`.
**Indexes:** Nenhum composto adicional necessário (query por `name asc`).

---

### 7.5 `finLedger`

**Path:** `franchises/{fId}/stores/{sId}/finLedger/{entryId}`
**Type:** `admin/src/types/finance.ts → LedgerEntry`
**Descrição:** Lançamentos financeiros (entradas/saídas) centralizados — fonte da verdade do fluxo de caixa.

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `direction` | `'in' \| 'out'` | Entrada ou saída |
| `status` | `'pending' \| 'paid' \| 'reconciled' \| 'canceled'` | Status |
| `competenceDate` | `Timestamp` | Data de competência (contábil) |
| `cashDate` | `Timestamp?` | Data de caixa (efetiva) |
| `amount` | `number` | Valor |
| `accountId` | `string` | Conta vinculada (→ `accounts`) |
| `categoryId` | `string` | Categoria financeira (→ `categories`) |
| `costCenterId` | `string?` | Centro de custo (→ `costCenters`) |
| `partyId` | `string?` | Terceiro vinculado (→ `parties`) |
| `method` | `'pix' \| 'card' \| 'cash' \| 'transfer'` | Método de pagamento |
| `sourceType` | `'kiosk_order' \| 'commercial_event' \| 'invoice' \| 'bill' \| 'manual'` | Origem |
| `sourceId` | `string` | ID do documento de origem (idempotência) |
| `description` | `string` | Descrição do lançamento |
| `attachments` | `string[]` | URLs do Storage |
| `createdBy` | `string` | UID do criador |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

#### Consumidores

| Consumidor | Arquivo | Uso |
|------------|---------|-----|
| `useLedger` | `admin/src/hooks/useLedger.ts` | CRUD + `incomeEntries`, `expenseEntries`, `totalIncome`, `totalExpenses`, `balance`, `pendingEntries` |
| `FinanceCashTab` | `admin/src/components/store/finance/FinanceCashTab.tsx` | Tabela de extrato, criar lançamento, ações rápidas (pagar/conciliar) |
| `FinanceOverviewTab` | `admin/src/components/store/finance/FinanceOverviewTab.tsx` | KPIs receita/despesa/fluxo líquido, últimos lançamentos |
| `FinanceReportsTab` | `admin/src/components/store/finance/FinanceReportsTab.tsx` | DRE, fluxo mensal, análise por categoria |

**Rules:** Leitura/escrita requer autenticação + role com permissão `finance:read`/`finance:write`.
**Indexes:** `competenceDate desc` (query padrão).

---

### 7.6 `finInvoices` + subcoleção `lines`

**Path:** `franchises/{fId}/stores/{sId}/finInvoices/{invoiceId}`
**Lines path:** `franchises/{fId}/stores/{sId}/finInvoices/{invoiceId}/lines/{lineId}`
**Type:** `admin/src/types/finance.ts → Invoice`, `InvoiceLine`
**Descrição:** Contas a receber (faturas emitidas). Cada fatura pode ter linhas detalhando os itens.

#### Campos (Invoice)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `partyId` | `string` | Terceiro / cliente (→ `parties`) |
| `status` | `'draft' \| 'issued' \| 'partially_paid' \| 'paid' \| 'overdue' \| 'canceled'` | Status |
| `issueDate` | `Timestamp` | Data de emissão |
| `dueDate` | `Timestamp` | Data de vencimento |
| `subtotal` | `number` | Subtotal |
| `discounts` | `number` | Descontos |
| `fees` | `number` | Taxas/acréscimos |
| `total` | `number` | Total da fatura |
| `paidTotal` | `number` | Total já pago |
| `remaining` | `number` | Saldo restante |
| `sourceType` | `'commercial_event' \| 'kiosk' \| 'manual'` | Origem |
| `sourceId` | `string?` | ID do documento de origem |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

#### Campos (InvoiceLine)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `description` | `string` | Descrição do item |
| `qty` | `number` | Quantidade |
| `unitPrice` | `number` | Preço unitário |
| `total` | `number` | Total da linha (`qty * unitPrice`) |
| `categoryId` | `string?` | Categoria financeira |

#### Consumidores

| Consumidor | Arquivo | Uso |
|------------|---------|-----|
| `useInvoices` | `admin/src/hooks/useInvoices.ts` | CRUD invoices + `fetchInvoiceLines`, `createInvoiceLine`, `deleteInvoiceLine`, `overdueInvoices`, `totalReceivable`, `totalReceived` |
| `FinanceARTab` | `admin/src/components/store/finance/FinanceARTab.tsx` | Tabela de faturas, CRUD dialog, InvoiceDetailDialog (linhas), syncTotals |
| `FinanceOverviewTab` | `admin/src/components/store/finance/FinanceOverviewTab.tsx` | KPI a receber, vencidas, barra de progresso |

**Rules:** Leitura/escrita requer autenticação + role com permissão `finance:read`/`finance:write`.
**Indexes:** `dueDate desc` (query padrão).

---

### 7.7 `finBills`

**Path:** `franchises/{fId}/stores/{sId}/finBills/{billId}`
**Type:** `admin/src/types/finance.ts → Bill`
**Descrição:** Contas a pagar (despesas e obrigações com fornecedores/terceiros).

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `partyId` | `string` | Terceiro / fornecedor (→ `parties`) |
| `status` | `'draft' \| 'scheduled' \| 'partially_paid' \| 'paid' \| 'overdue' \| 'canceled'` | Status |
| `issueDate` | `Timestamp` | Data de emissão |
| `dueDate` | `Timestamp` | Data de vencimento |
| `total` | `number` | Valor total |
| `paidTotal` | `number` | Valor já pago |
| `remaining` | `number` | Saldo restante |
| `categoryId` | `string` | Categoria financeira (→ `categories`) |
| `costCenterId` | `string?` | Centro de custo (→ `costCenters`) |
| `attachments` | `string[]` | URLs de anexos |
| `createdAt` | `Timestamp` | Data de criação |
| `updatedAt` | `Timestamp` | Última atualização |

#### Consumidores

| Consumidor | Arquivo | Uso |
|------------|---------|-----|
| `useBills` | `admin/src/hooks/useBills.ts` | CRUD + `overdueBills`, `totalPayable`, `totalPaid` |
| `FinanceAPTab` | `admin/src/components/store/finance/FinanceAPTab.tsx` | Tabela de contas a pagar, CRUD dialog, ação marcar como paga |
| `FinanceOverviewTab` | `admin/src/components/store/finance/FinanceOverviewTab.tsx` | KPI a pagar, vencidas, próximos pagamentos, barra de progresso |

**Rules:** Leitura/escrita requer autenticação + role com permissão `finance:read`/`finance:write`.
**Indexes:** `dueDate asc` (query padrão).

---

### 7.8 `finPayments`

**Path:** `franchises/{fId}/stores/{sId}/finPayments/{paymentId}`
**Type:** `admin/src/types/finance.ts → FinPayment`
**Descrição:** Registros de pagamentos financeiros, vinculando faturas/contas a contas bancárias.

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento |
| `direction` | `'in' \| 'out'` | Direção do pagamento |
| `date` | `Timestamp` | Data do pagamento |
| `amount` | `number` | Valor pago |
| `method` | `'pix' \| 'card' \| 'cash' \| 'transfer'` | Método |
| `accountId` | `string` | Conta destino/origem (→ `accounts`) |
| `targetType` | `'invoice' \| 'bill' \| 'ledger'` | Tipo do documento alvo |
| `targetId` | `string` | ID do documento alvo |
| `notes` | `string?` | Observações |
| `createdBy` | `string` | UID do criador |
| `createdAt` | `Timestamp` | Data de criação |

#### Consumidores

| Consumidor | Arquivo | Uso |
|------------|---------|-----|
| `useFinPayments` | `admin/src/hooks/useFinPayments.ts` | CRUD + `inPayments`, `outPayments`, `totalIn`, `totalOut` |

**Rules:** Leitura/escrita requer autenticação + role com permissão `finance:read`/`finance:write`.
**Indexes:** `date desc` (query padrão).

---

### 7.9 `financeSummary`

**Path:** `franchises/{franchiseId}/financeSummary/{periodId}`
**Type:** `admin/src/types/finance.ts → FinanceSummary`
**Descrição:** Resumo financeiro consolidado por período (mensal) no nível da franquia, agregando dados de todas as lojas. Materializado via Cloud Functions.

#### Campos (FinanceSummary)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string?` | ID do documento (ex: `'2026-02'`) |
| `totalRevenue` | `number` | Receita total consolidada |
| `totalExpenses` | `number` | Despesas totais consolidadas |
| `balance` | `number` | Saldo do período |
| `byStore` | `Record<string, StoreFinanceSummary>` | Breakdown por loja |
| `updatedAt` | `Timestamp` | Data de geração/atualização |

**`StoreFinanceSummary` (embedded):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `revenue` | `number` | Receita da loja |
| `expenses` | `number` | Despesas da loja |
| `balance` | `number` | Saldo da loja |

**Rules:** Leitura requer autenticação + role `admin` ou superior na franquia. Escrita somente via Cloud Functions.
**Indexes:** Nenhum composto adicional necessário.

---

## 8. Coleções de Migração

**Path:** `migrations/{migrationName}/{runId}/*`  
**Descrição:** Registros de execução de migrações de dados (apenas Cloud Functions).

| Path | Função | Descrição |
|------|--------|-----------|
| `migrations/paymentGatewayConfig/{runId}/stores/{sId}` | `consolidatePaymentGatewayConfig` | Backup de config de pagamento |
| `migrations/unifyStoreSettings/{runId}/stores/{compositeId}` | `unifyStoreSettings` | Backup de settings |

---

## 9. Collection Group Queries

| Collection Group | Quem usa | Filtros | Objetivo |
|------------------|----------|---------|----------|
| `members` | Admin `FranchiseContext`, Kiosk `franchiseService` | `userId == uid AND isActive == true` | Descobrir franquias do user |
| `orders` | Rules (SuperAdmin) | SuperAdmin read | Dashboard global |
| `devices` | Rules | `where franchiseId` | Status global |
| `dailyStats` | Rules | `where franchiseId` | Stats globais |
| `metrics` | Rules | `where franchiseId` | KPIs globais |
| `hardware` | Rules | `where franchiseId` | Status hardware global |
| `payments` | Functions `syncPendingPayments` | `status == 'pending'` | Sync pagamentos pendentes |

---

## 10. Indexes Compostos

Definidos em `firestore.indexes.json`:

| Coleção | Tipo | Campos | Uso |
|---------|------|--------|-----|
| `members` | COLLECTION_GROUP | `userId ↑, isActive ↑` | Buscar memberships |
| `members` | COLLECTION | `isActive ↑, joinedAt ↓` | Listar membros ativos |
| `notifications` | COLLECTION | `isDismissed ↑, createdAt ↓` | Notificações ativas |
| `notifications` | COLLECTION | `isRead ↑, createdAt ↑` | Não lidas |
| `notifications` | COLLECTION | `userId ↑, isDismissed ↑, createdAt ↓` | Do usuário |
| `notifications` | COLLECTION | `userId ↑, createdAt ↑` | Timeline |
| `invitations` | COLLECTION | `franchiseId ↑, createdAt ↓` | Da franquia |
| `invitations` | COLLECTION | `franchiseId ↑, status ↑, createdAt ↓` | Pendentes |
| `invitations` | COLLECTION | `token ↑, status ↑` | Por token |
| `invitations` | COLLECTION | `franchiseId ↑, email ↑, status ↑` | Deduplicação |
| `auditLogs` | COLLECTION | `action ↑, timestamp ↓` | Por ação |
| `auditLogs` | COLLECTION | `actor.id ↑, timestamp ↓` | Por ator |
| `auditLogs` | COLLECTION | `target.type ↑, timestamp ↓` | Por tipo de alvo |
| `orders` | COLLECTION | `status ↑, timestamp ↓` | Por status |
| `members` | Field Override | `userId` — COLLECTION + COLLECTION_GROUP | collectionGroup support |
| `deals` | COLLECTION | `stage ↑, nextActionAt ↑` | Pipeline por estágio |
| `deals` | COLLECTION | `ownerUserId ↑, stage ↑, updatedAt ↓` | Deals do vendedor |
| `calendarItems` | COLLECTION | `ownerUserId ↑, startAt ↑` | Agenda do vendedor |
| `calendarItems` | COLLECTION | `status ↑, startAt ↑` | Agenda ativa |
| `customers` | COLLECTION | `status ↑, name ↑` | Clientes por status |
| `commercialEvents` | COLLECTION | `status ↑, startAt ↑` | Eventos por status |
| `quotes` | COLLECTION | `status ↑, createdAt ↓` | Propostas por status |
| `ledger` | COLLECTION | `accountId ↑, cashDate ↓` | Extrato por conta |
| `ledger` | COLLECTION | `status ↑, cashDate ↓` | Lançamentos por status |
| `ledger` | COLLECTION | `direction ↑, categoryId ↑, cashDate ↓` | Relatório por cat. |
| `ledger` | COLLECTION | `sourceType ↑, sourceId ↑` | Rastreio origem |
| `invoices` | COLLECTION | `status ↑, dueDate ↑` | A receber por vencimento |
| `bills` | COLLECTION | `status ↑, dueDate ↑` | A pagar por vencimento |
| `activities` | COLLECTION | `status ↑, dueAt ↑` | Atividades pendentes |

---

# PARTE II — ARMAZENAMENTO LOCAL (BROWSER / DISPOSITIVO)

## 11. Visão Geral do Armazenamento Local

O Kiosk App opera em modo **offline-first** com 4 camadas de armazenamento local:

```
┌──────────────────────────────────────────────────────┐
│ 1. Firestore SDK Offline Cache                       │
│    (persistentLocalCache + multiTabManager)           │
│    Gerenciado automaticamente pelo SDK — transparente │
├──────────────────────────────────────────────────────┤
│ 2. IndexedDB — "kiosk_cache" (DB Version 3)          │
│    7 object stores para cache explícito + sync queue  │
├──────────────────────────────────────────────────────┤
│ 3. Cache API — "kiosk-video-cache-v1"                │
│    Armazenamento de blobs de vídeo (até 500MB)        │
├──────────────────────────────────────────────────────┤
│ 4. localStorage                                      │
│    Hot cache rápido + estado de sessão/dispositivo     │
└──────────────────────────────────────────────────────┘
```

**Prioridade de leitura:** localStorage (hot cache) → IndexedDB → Firestore cache → Firestore online  
**Fallback:** Quando IndexedDB falha (Safari Private Browsing), cai para localStorage.

---

## 12. Firestore Offline Cache (SDK)

**Gerenciado por:** Firebase SDK v9+  
**Configuração:** `src/services/firebase.ts`

```typescript
db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  }),
});
```

| Aspecto | Valor |
|---------|-------|
| **Storage engine** | IndexedDB (gerenciado pelo SDK, DB separada do `kiosk_cache`) |
| **Cache size** | `CACHE_SIZE_UNLIMITED` — sem garbage collection |
| **Multi-tab** | `persistentMultipleTabManager()` — sincroniza entre abas |
| **Escopo** | Todos os documentos lidos/escritos pelo app ficam em cache |
| **Transparência** | O app não interage diretamente — queries retornam do cache quando offline |
| **Auth persistence** | `browserLocalPersistence` — sessão de auth sobrevive refresh |
| **Fallback** | Se `persistentLocalCache` falhar → `getFirestore(app)` (sem cache persistente) |

#### Consumo

| Arquivo | O que persiste |
|---------|---------------|
| `services/firebase.ts` → `initializeFirebaseFromEnv()` | Primeira inicialização com cache persistente |
| `services/firebase.ts` → `initializeFirebase(settings)` | Inicialização com settings (mesmo cache) |
| `services/authService.ts` → `setPersistence(auth, browserLocalPersistence)` | Persistência de sessão Auth |

---

## 13. IndexedDB — `kiosk_cache`

**DB Name:** `kiosk_cache`  
**Version:** `3`  
**Gerenciado por:** `src/services/cacheService.ts`  
**Fallback:** localStorage quando IndexedDB falha (Safari Private Browsing, quota = 0)  
**Teste de disponibilidade:** `testIndexedDBFunctional()` — abre DB teste, tenta write, remove. Retesta a cada 60s.

### 13.1 `settings` (store)

| Aspecto | Valor |
|---------|-------|
| **keyPath** | `id` |
| **Indexes** | nenhum |
| **Interface** | `CachedSettings { id, data, updatedAt }` |

**Uso:** Cache de configurações da loja para boot rápido offline.

| Arquivo | Operação | Função |
|---------|----------|--------|
| `hooks/useStoreSettings.tsx` | R, W | Salva/carrega settings da loja no boot |

---

### 13.2 `products` (store)

| Aspecto | Valor |
|---------|-------|
| **keyPath** | `id` |
| **Indexes** | `storeId` (non-unique), `updatedAt` (non-unique) |
| **Interface** | `CachedProduct { id, data: Product, updatedAt: number, storeId }` |

**Uso:** Cache de produtos para exibição instantânea sem rede.

| Arquivo | Operação | Função |
|---------|----------|--------|
| `services/productCacheService.ts` | R, W, B, D | `saveProductsToCache()`, `loadProductsFromCache()`, `updateProductInCache()`, `removeProductFromCache()`, `clearProductCache()` |
| `hooks/useFirebaseProducts.tsx` | W (indireto) | Via productCacheService após sync Firestore |

---

### 13.3 `videos` (store)

| Aspecto | Valor |
|---------|-------|
| **keyPath** | `id` |
| **Indexes** | `storeId` (non-unique), `cachedAt` (non-unique) |
| **Interface** | `CachedVideo { id, url, blob?, version, cachedAt, size, storeId }` |

**Uso:** Metadados de vídeos em cache (o blob fica no Cache API §12).

| Arquivo | Operação | Função |
|---------|----------|--------|
| `services/videoCacheService.ts` | R, W, D | `downloadVideo()`, `getCachedVideoUrl()`, `isVideoCached()`, `removeVideoFromCache()`, `clearVideoCache()` |
| `services/cleanupService.ts` | R, D | `cleanupVideos()` — remove vídeos antigos (>14 dias) ou de outra loja |

---

### 13.4 `syncQueue` (store)

| Aspecto | Valor |
|---------|-------|
| **keyPath** | `id` |
| **Indexes** | `createdAt` (non-unique), `collection` (non-unique) |
| **Interface** | `SyncQueueItem { id, operation, collection, docId, data?, createdAt, retryCount, storeId, franchiseId? }` |

**Uso:** Fila de operações pendentes de sincronização com Firestore quando offline.

**Fluxo:**
1. Operação Firestore falha (offline) → `enqueueSync()` adiciona à fila
2. Background sync a cada 30s tenta processar (`processQueue()`)
3. Retry exponencial: base 1s, max 60s, max 5 tentativas
4. Após 5 falhas → move para DLQ (§11.5)
5. Itens processados com sucesso são removidos
6. Tipos especiais (`serverTimestamp`, `increment`) são reconstruídos no momento do sync

**Coleções suportadas:** `orders`, `servingSessions`, `wastageEvents`, e qualquer `StoreSubcollection`  
**Imutabilidade:** `servingSessions` e `wastageEvents` usam transaction `create-if-absent` para idempotência.

| Arquivo | Operação | Função |
|---------|----------|--------|
| `services/syncService.ts` | R, W, D, B | `enqueueSync()`, `processQueue()`, `clearSyncQueue()` |
| `services/servingSessionService.ts` | W (indireto) | `persistSession()` → fallback offline |
| `services/cleanupService.ts` | R, D | `cleanupSyncQueue()` — remove itens >7 dias, limita a 100 |

---

### 13.5 `syncDLQ` (store)

| Aspecto | Valor |
|---------|-------|
| **keyPath** | `id` |
| **Indexes** | nenhum (criado on-the-fly na versão 3) |
| **Interface** | `SyncQueueItem & { failedAt: number, lastError: string }` |

**Uso:** Dead Letter Queue — itens que falharam 5+ vezes e precisam de investigação manual.

| Arquivo | Operação | Função |
|---------|----------|--------|
| `services/syncService.ts` | W | `processQueue()` — move itens `retryCount >= 5` |

---

### 13.6 `taps` (store)

| Aspecto | Valor |
|---------|-------|
| **keyPath** | `id` |
| **Indexes** | `storeId` (non-unique) |
| **Interface** | Genérica (TapConfig serializado) |

**Uso:** Cache de configuração de torneiras para boot rápido.

| Arquivo | Operação | Função |
|---------|----------|--------|
| `hooks/useTapConfiguration.ts` | R, W | Cache via localStorage (ver §13 chave `open-kiosk:tapsConfig`) |

---

### 13.7 `failedDispenses` (store)

| Aspecto | Valor |
|---------|-------|
| **keyPath** | `id` |
| **Indexes** | `timestamp` (non-unique) |
| **Interface** | `FailedDispense { id, orderNumber, reason, timestamp, retryCount, storeId }` |

**Uso:** Persiste dispensações falhadas (pagou mas não dispensou) para reconciliação no startup.

**Fluxo:**
1. Dispense falha → `persistFailedDispense(orderNumber, reason)` salva no IDB
2. No startup → `reconcileOnStartup()` sincroniza com Firestore (`updateOrderDispenseStatus → 'failed_dispense'`)
3. Após sync bem-sucedido → remove da fila IDB
4. Admin dashboard mostra pedidos `failed_dispense` para compensação manual

| Arquivo | Operação | Função |
|---------|----------|--------|
| `services/dispenseRecoveryService.ts` | R, W, D | `persistFailedDispense()`, `reconcileOnStartup()`, `clearFailedDispense()`, `getPendingFailedDispenses()` |

---

## 14. Cache API — `kiosk-video-cache-v1`

**Cache name:** `kiosk-video-cache-v1`  
**Limite:** 500 MB  
**Gerenciado por:** `src/services/videoCacheService.ts`  
**Conteúdo:** Blobs de vídeo (mp4) para tela de atração

| Aspecto | Valor |
|---------|-------|
| **Storage** | Browser Cache API (`caches.open(...)`) |
| **Versionamento** | Hash da URL (btoa truncado 16 chars) |
| **CORS** | Apenas same-origin ou CDNs permitidos (Firebase Storage, gstatic, jsdelivr, unpkg, cdnjs) |
| **Fallback** | URL original carregada diretamente pelo `<video>` |
| **Download** | Streaming com progresso (`ReadableStream`) |
| **Limpeza** | `cleanupService` remove caches antigos (prefixo `kiosk-video-cache` mas != `v1`) |
| **Memory leaks** | `revokeVideoObjectURL()` / `revokeAllVideoObjectURLs()` — revoga ObjectURLs |

**Relação com IndexedDB:** Os metadados (url, version, size, cachedAt) ficam na store `videos` do IndexedDB (§11.3). O blob real fica no Cache API.

| Arquivo | Operação | Função |
|---------|----------|--------|
| `services/videoCacheService.ts` | R, W, D | `downloadVideo()`, `getCachedVideoUrl()`, `removeVideoFromCache()`, `clearVideoCache()` |
| `services/cleanupService.ts` | D | Remove caches com prefixo obsoleto |

---

## 15. localStorage — Chaves do Kiosk

Todas as chaves usadas pelo Kiosk App (`src/`):

### Identidade e Sessão

| Chave | Tipo | Service/Hook | Descrição |
|-------|------|-------------|-----------|
| `open-kiosk:deviceId` | `string` (UUID) | `services/deviceHeartbeatService.ts` | ID persistente do dispositivo (Capacitor ou UUID gerado). Usado como docId em `devices/{deviceId}` no Firestore |
| `openKiosk_pinHash` | `string` (PBKDF2 hash) | `services/authService.ts` | Hash do PIN offline para autenticação sem rede |
| `openKiosk_offlineSession` | `JSON (OfflineSession)` | `services/authService.ts` | Sessão offline com role, storeAccess, expiresAt (7 dias). Permite operação total sem Firebase Auth |
| `openKiosk_offlineSession_cached` | `JSON (OfflineSession)` | `services/authService.ts` | Cópia de backup da sessão offline |
| `rememberEmail` | `string` | `components/auth/LoginForm.tsx` | Email salvo para "lembrar-me" |

### Seleção de Franquia/Loja

| Chave | Tipo | Service/Hook | Descrição |
|-------|------|-------------|-----------|
| `open-kiosk-admin:selectedFranchise` | `string` (franchiseId) | `services/firebase.ts`, `context/FranchiseContext.tsx`, `context/StoreContext.tsx` | Franquia atualmente selecionada. **Compartilhada com Admin** para compatibilidade |
| `open-kiosk-admin:selectedStore` | `string` (storeId) | `services/firebase.ts`, `context/FranchiseContext.tsx`, `context/StoreContext.tsx` | Loja atualmente selecionada. **Compartilhada com Admin** |
| `storeSettings` | `JSON (StoreSettings)` | `hooks/useStoreSettings.tsx`, `services/firebase.ts`, `services/storeService.ts`, `context/StoreContext.tsx` | Objeto completo de settings da loja. Hot cache de todas as configurações. Inclui `franchiseId`, `storeId`, `firebaseConfig`, etc. É a fonte primária de contexto para o Kiosk |
| `settingsUpdatedAt` | `ISO string` | `hooks/useStoreSettings.tsx` | Timestamp da última atualização local de settings |

### Produtos

| Chave | Tipo | Service/Hook | Descrição |
|-------|------|-------------|-----------|
| `cached_products` | `JSON { storeId, products[], updatedAt }` | `services/productCacheService.ts` | Hot cache de produtos. Lido antes do IndexedDB |
| `products_cache_version` | `string (timestamp)` | `services/productCacheService.ts` | Versão do cache para invalidação |

### Hardware / ESP32

| Chave | Tipo | Service/Hook | Descrição |
|-------|------|-------------|-----------|
| `esp32_wifi_ip` | `string` (IP) | `services/esp32CommunicationService.ts` | IP WiFi customizado do ESP32 (override do default `192.168.4.1`) |
| `esp32_last_connection` | `JSON { type, id, timestamp }` | `services/esp32CommunicationService.ts` | Último tipo/ID de conexão para reconexão rápida |
| `open-kiosk:tapsConfig` | `JSON { taps[], version }` | `hooks/useTapConfiguration.ts` | Cache da configuração de torneiras para boot sem rede |
| `applied_taps_version:${fId}:${sId}` | `string (number)` | `context/ESP32Context.tsx` | Versão de torneiras já aplicada ao ESP32 (por franquia/loja). Evita reaplicar config no reconect |
| `kiosk_default_tap_id` | `string (number)` | `components/TapSettingsSync.tsx` | ID da torneira padrão deste tablet. Permite N tablets controlando N torneiras diferentes da mesma ESP32 |

### Pagamentos

| Chave | Tipo | Service/Hook | Descrição |
|-------|------|-------------|-----------|
| `mp_polling_state` | `JSON (PollingState)` | `hooks/useMercadoPagoPolling.ts` | Estado de polling de pagamento PIX/QR. Sobrevive refresh. Auto-expira em 10 min |
| `mp_last_terminal_order` | `JSON { orderId, terminalId, createdAt }` | `services/paymentService.ts` | Último orderId do terminal Point. Para cancelar ordem anterior antes de criar nova |

### Idioma

| Chave | Tipo | Service/Hook | Descrição |
|-------|------|-------------|-----------|
| `kiosk_language_${storeId}` | `'en' \| 'pt-BR'` | `i18n/LanguageContext.tsx` | Idioma por loja (kiosk mode) |
| `kiosk_language_default` | `'en' \| 'pt-BR'` | `i18n/LanguageContext.tsx` | Idioma fallback quando storeId indefinido |
| `admin_language` | `'en' \| 'pt-BR'` | `i18n/LanguageContext.tsx` | Idioma do painel admin (usado quando `isKiosk=false`) |

---

## 16. localStorage — Chaves do Admin

Todas as chaves usadas pelo Admin App (`admin/src/`):

| Chave | Tipo | Service/Hook | Descrição |
|-------|------|-------------|-----------|
| `open-kiosk-admin:selectedFranchise` | `string` (franchiseId) | `admin/src/context/FranchiseContext.tsx` | Franquia selecionada. **Compartilhada com Kiosk** |
| `sidebarCollapsed` | `'true' \| 'false'` | `admin/src/hooks/useSidebar.tsx` | Estado da sidebar (colapsada ou expandida) |
| `whatsapp_group_modal_*` | `string (timestamp)` | `admin/src/components/landing/WhatsAppGroupModal.tsx` | Cooldown do modal de WhatsApp (landing page) |
| `exitIntentModal_*` | `string (timestamp)` | `admin/src/components/landing/ExitIntentModal.tsx` | Cooldown do modal de exit intent (landing page) |

---

## 17. Limpeza Automática (Cleanup)

**Gerenciado por:** `src/services/cleanupService.ts`  
**Execução:** A cada 1 hora em background

| Alvo | Regra de limpeza | Parâmetro |
|------|-----------------|-----------|
| **syncQueue** (IDB) | Remove itens >7 dias ou retryCount ≥ 10. Limita a 100 itens | `SYNC_QUEUE_MAX_AGE_MS: 7d` |
| **products** (IDB) | Remove de outras lojas ou >30 dias | `PRODUCTS_MAX_AGE_MS: 30d` |
| **videos** (IDB) | Remove de outras lojas ou >14 dias | `VIDEOS_MAX_AGE_MS: 14d` |
| **Cache API** | Remove caches `kiosk-video-cache-*` que não são `v1` | — |
| **localStorage** | Remove chaves com prefixo `temp_`, `debug_`, `_old_` e chaves deprecated (`old_settings`, `temp_cart`) | — |

---

# PARTE III — RESUMOS

## 18. Matriz Coleção × Consumidor (Firestore)

Legenda: **R** = Read, **W** = Write, **L** = Listen (onSnapshot), **D** = Delete, **B** = Batch, **T** = Transaction

| Coleção | Admin App | Kiosk App | Cloud Functions |
|---------|-----------|-----------|-----------------|
| `superadmins` | — | — | R, W, D |
| `users` | W | R, W, D | R, W |
| `invitations` | R, W | R, W, B | R, W |
| `audit_logs` (legado) | L | — | W |
| `settings` (global) | — | R | — |
| `analytics/*` | — | — | W |
| `franchises` | R, W, D | R, W | R, W |
| `…/members` | R, W, D | R, W, B | R, W |
| `…/auditLogs` | R, W, L | — | W |
| `…/notifications` | R, W, L, B, D | — | R, W, D |
| `…/billingEvents` | R | — | W |
| `…/metrics` (franchise) | — | — | R, W |
| `stores` (doc) | R, W, D | R, W, L | R, W |
| `…/products` | R | R, W, L, D, T | D |
| `…/orders` | R, W | R, W, T | R, D |
| `…/payments` | — | L, W | R, W, D |
| `…/dispensers` | — | R, W, D, L | D |
| `…/settings` | — | R, W, L | R, D |
| `…/inventoryLogs` | — | — | — |
| `…/hardware` | — | W, L | — |
| `…/devices` | — | W | — |
| `…/dailyStats` | R | — | R, W |
| `…/metrics` (store) | R | — | R, W |
| `…/taps` | R, W, L, B | R | R, W, D |
| `…/kegs` | R, W, B | — | R, W |
| `…/tapAssignments` | R, B | — | R, W |
| `…/servingSessions` | — | W, T | R, D |
| `…/wastageEvents` | R, W | — | R, W, D |
| `…/maintenanceLogs` | R, W | — | R, W, D |
| `…/notifications` (store) | — | — | (via franchise-level) |
| `migrations/*` | — | — | R, W |

---

## 19. Fluxo Offline-First (Kiosk)

```
┌──────────────────────────────────────────────────────────────────┐
│                        ONLINE                                     │
│                                                                   │
│  UI ─→ Service ─→ Firestore SDK ─→ Firestore Cloud               │
│         │                              │                          │
│         ├─→ productCacheService ─→ IDB products + LS hot cache   │
│         ├─→ cacheService ─→ IDB settings                         │
│         └─→ videoCacheService ─→ Cache API + IDB metadata        │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                        OFFLINE                                    │
│                                                                   │
│  UI ─→ Service ─┐                                                │
│                  ├─→ Firestore SDK cache (leitura transparente)   │
│                  ├─→ IDB products/settings (leitura direta)       │
│                  ├─→ LS storeSettings / cached_products (hot)     │
│                  └─→ enqueueSync() ─→ IDB syncQueue (escrita)    │
│                                                                   │
│  authService ─→ LS openKiosk_offlineSession (PIN auth offline)   │
│  dispenseRecovery ─→ IDB failedDispenses (fallback de dispense)  │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                     RECONEXÃO                                     │
│                                                                   │
│  syncService.processQueue() ─→ IDB syncQueue ─→ Firestore Cloud │
│  dispenseRecovery.reconcileOnStartup() ─→ IDB failedDispenses    │
│                                           ─→ orders (Firestore)  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 20. Notas Importantes

1. **Total de coleções Firestore:** **27 coleções/subcoleções** distintas + 2 de migração.

2. **Total de Cloud Functions:** **38 funções exportadas** (triggers, scheduled, onCall, HTTP).

3. **Total de object stores IndexedDB:** **7** (`settings`, `products`, `videos`, `syncQueue`, `syncDLQ`, `taps`, `failedDispenses`).

4. **Total de chaves localStorage (Kiosk):** **17 chaves** (mais variantes dinâmicas como `applied_taps_version:${fId}:${sId}` e `kiosk_language_${storeId}`).

5. **Total de chaves localStorage (Admin):** **4 chaves** (mais variantes dinâmicas dos modais da landing page).

6. **Notificações duplicadas:** Existem em 2 níveis:
   - `franchises/{fId}/notifications` — alertas de gestão (Admin UI)
   - `franchises/{fId}/stores/{sId}/notifications` — operacionais (Functions → encaminhadas para franchise)

7. **audit_logs vs auditLogs:** A global `audit_logs` é **legada**. Canônica: `franchises/{fId}/auditLogs`. O `AuditPage` tenta ambas como fallback.

8. **inventoryLogs:** Definida nas rules e pathResolver mas **sem consumo direto** nos services/components atuais.

9. **Imutabilidade:** `servingSessions`, `wastageEvents`, `billingEvents`, `audit_logs`, `auditLogs`, `inventoryLogs` são **append-only**.

10. **Campos legados:** Vários campos em `stores` e `paymentGatewayConfig` são deprecated. Migrações em `functions/src/migrations/` consolidam.

11. **Safari Private Browsing:** IndexedDB disponível mas quota = 0. O `cacheService` detecta e faz fallback para localStorage.

12. **Compartilhamento Kiosk↔Admin:** As chaves `open-kiosk-admin:selectedFranchise` e `open-kiosk-admin:selectedStore` são **compartilhadas** entre os dois apps para manter contexto consistente quando executados no mesmo browser.
