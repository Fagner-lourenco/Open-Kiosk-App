# Open Kiosk - README Mestre

Projeto full-stack para operação de quiosques/totens (Kiosk Web + Admin) com backend em Firebase Cloud Functions, Firestore e integração com hardware ESP32.

## 1. Visão Geral

Módulos do repositório:

- `src/`: app Kiosk Web (operação de loja/totem).
- `admin/src/`: app Admin (franquias, lojas, equipe, relatórios, auditoria, billing).
- `functions/src/`: backend serverless (auth/claims, convites, billing, analytics, pagamentos, ERP, migrações, limpeza).
- `shared/`: tipos/schemas/config compartilhados (roles, permissões, store schemas, gateways).
- `android/` + `capacitor.config.ts`: empacotamento Android do Kiosk (Capacitor).
- `firmware/`: firmware ESP32 e manual de hardware.

Evidências:
- `package.json`, `admin/package.json`, `functions/package.json`
- `src/main.tsx`, `admin/src/main.tsx`, `functions/src/index.ts`

## 2. Arquitetura (diagrama textual)

```text
[Kiosk Web - src/] --(Firebase SDK)--> Firestore/Auth/Storage
       |                                  ^
       |-- ESP32 (USB/BLE/Wi-Fi)          |
       v                                  |
[Android Capacitor]

[Admin Web - admin/src/] --(Firebase SDK)----+
                                              |
                                   [Cloud Functions - functions/src/]
                                              |
                           (webhooks/cron/triggers/callables)
                                              |
                                          Firestore
```

## 3. Apps e Como Rodar Localmente

Pré-requisitos:

- Node.js 20+
- npm
- Firebase CLI (para emuladores/deploy)
- (Opcional) Android Studio + SDK para build mobile

### 3.1 Kiosk Web (`/`)

- Entrypoints: `src/main.tsx`, `src/App.tsx`
- Dev: `npm install && npm run dev` (porta `8080` em `vite.config.ts`)
- Build: `npm run build`
- Testes: `npm run test`

### 3.2 Admin (`/admin`)

- Entrypoints: `admin/src/main.tsx`, `admin/src/App.tsx`
- Dev: `cd admin && npm install && npm run dev` (porta `5174` em `admin/vite.config.ts`)
- Build: `cd admin && npm run build`
- Testes: `cd admin && npm run test`

### 3.3 Cloud Functions (`/functions`)

- Entrypoint: `functions/src/index.ts`
- Build: `cd functions && npm install && npm run build`
- Emulador: `cd functions && npm run serve`
- Deploy: `cd functions && npm run deploy`

Status build/test:

- Não verificado por execução nesta varredura.
- Logs encontrados no repo:
  - `testresult.txt`: `61 passed`, `EXIT_CODE: 0`
  - `test-all-result.log`: `726 passed`, mas `EXIT:1`
  - `test-result2.log`: falha de runner Vitest (`EXIT:1`)

## 4. Variáveis de Ambiente

### 4.1 Kiosk (raiz)

Fonte: `.env.example`, `src/services/firebase.ts`, `src/config/mercadopago.ts`

- Firebase: `VITE_FIREBASE_*`
- Pagamentos: `VITE_MP_MODE`, `VITE_MP_ACCESS_TOKEN_*`, `VITE_MP_TERMINAL_ID`, `VITE_MP_STORE_ID`, `VITE_MP_POS_ID`
- Operacional: `VITE_ROOT_PIN`, `VITE_DEBUG`, `VITE_APP_VERSION`

### 4.2 Admin

Fonte: `admin/.env.example`, `admin/src/lib/firebase.ts`, `admin/src/config/navConfig.ts`

- Firebase: `VITE_FIREBASE_*`
- Emuladores: `VITE_USE_FIREBASE_EMULATORS`
- Feature flag de navegação por permissão: `VITE_ENABLE_PERMISSION_FILTERED_NAV`

### 4.3 Functions

Fonte: `functions/src/**` (`functions.config()`)

- `smtp.*` (envio de convites)
- `app.url` (links de convite/billing)
- `pagbank.*` (webhook/token)
- `superadmin.secret`, `superadmin.enabled`

## 5. Banco de Dados (Inventário)

## 5.1 Firestore (principal)

Regras canônicas em `firestore.rules`; índices em `firestore.indexes.json`.

Coleções top-level identificadas:

- `superadmins`
- `users`
- `franchises`
- `invitations`
- `settings`
- `audit_logs` (legado/global)
- `analytics/{docType}/{docId}`

Subcoleções em `franchises/{franchiseId}`:

- `members`
- `stores`
- `metrics`
- `notifications`
- `billingEvents`
- `auditLogs`

Subcoleções em `franchises/{franchiseId}/stores/{storeId}`:

- `products`, `orders`, `payments`, `inventoryLogs`, `settings`, `dispensers`, `hardware`, `devices`, `dailyStats`, `metrics`
- ERP: `taps`, `kegs`, `tapAssignments`, `servingSessions`, `wastageEvents`, `maintenanceLogs`, `notifications`

Evidências:
- `firestore.rules` (`match /...`)
- `admin/src/lib/pathResolver.ts`
- `src/lib/pathResolver.ts`

### 5.2 Índices Firestore

Índices explícitos para `members`, `notifications`, `invitations`, `auditLogs`, `orders`.

Evidência: `firestore.indexes.json`

### 5.3 Tipos de dados (fontes)

- Franquia/membros/convites/auditoria: `admin/src/types/franchise.ts`, `admin/src/types/audit.ts`, `admin/src/types/user.ts`, `src/types/franchise.ts`
- Store/config operacional: `admin/src/types/store.ts`, `shared/types/store.ts`, `shared/types/operations.ts`
- Pagamentos: `src/types/payments.ts`, `functions/src/payments/types.ts`

### 5.4 Triggers/functions que leem/escrevem Firestore

- Auth claims e auditoria: `functions/src/auth/claims.ts`
- Convites: `functions/src/invitations/*`
- Billing Stripe: `functions/src/billing/*`
- Pagamentos/PagBank: `functions/src/payments/*`
- Analytics: `functions/src/analytics/*`
- ERP operacional: `functions/src/erp/*`
- Limpeza de store: `functions/src/cleanup/onDeleteStore.ts`
- Migrações: `functions/src/migrations/*`

### 5.5 Outros armazenamentos

- IndexedDB/localStorage/Cache API no Kiosk:
  - `src/services/cacheService.ts`
  - `src/services/productCacheService.ts`
  - `src/services/videoCacheService.ts`

SQL:

- Não encontrado no repo (`no-sql-files`).

## 6. Deploy

### 6.1 Firebase

Fonte: `firebase.json`

- Functions source: `functions/`
- Firestore: `firestore.rules` + `firestore.indexes.json`
- Hosting: `dist/` (SPA rewrite para `index.html`)

### 6.2 Vercel

- Root `vercel.json`: builda Admin (`cd admin && npm run build`, output `admin/dist`)
- `admin/vercel.json`: alternativa standalone do Admin

### 6.3 Android (Capacitor)

- Config: `capacitor.config.ts`
- Manifest: `android/app/src/main/AndroidManifest.xml`

## 7. Hardware / ESP32

Fonte principal:

- `src/services/esp32CommunicationService.ts`
- `src/services/esp32SerialService.ts`
- `firmware/firmware.ino`
- `firmware/ManualCircuito.md`

Modos de conexão suportados:

- USB serial (Web Serial + plugin nativo Android)
- BLE (`@capacitor-community/bluetooth-le`)
- Wi-Fi (ESP32 AP/IP configurável)

Ordem padrão de tentativa:

- `usb`, `wifi`, `bluetooth` (em `esp32CommunicationService.ts`)

Permissões Android relevantes:

- Internet/rede, BLE (`BLUETOOTH_SCAN/CONNECT/ADVERTISE`), localização para scan BLE, USB host, wake lock.

## 8. Auditoria e Logs

### 8.1 Onde os logs ficam

- Principal: `franchises/{franchiseId}/auditLogs`
- Legado/global: `audit_logs`

Evidências:
- Leitura Admin: `admin/src/pages/audit/AuditPage.tsx`
- Escrita Admin: `admin/src/services/auditService.ts`
- Escrita Functions (claims): `functions/src/auth/claims.ts`

### 8.2 Como validar rapidamente

1. Fazer uma ação auditável (ex.: login/admin claims/update store).
2. Verificar se documento é criado em `franchises/{franchiseId}/auditLogs`.
3. Abrir `/audit` no Admin e confirmar entrada.
4. Se vazio, verificar fallback/erros mostrados na `AuditPage` (permission-denied, missing index).

## 9. Contribuição e Padrões

- Lint:
  - raiz: `npm run lint`
  - admin: `cd admin && npm run lint`
- Testes:
  - raiz: `npm run test`
  - admin: `cd admin && npm run test`
  - functions: `cd functions && npm run test`
- Build:
  - raiz: `npm run build`
  - admin: `cd admin && npm run build`
  - functions: `cd functions && npm run build`

Padrões observados:

- Roteamento por app com guard de auth/permissão.
- Firestore multi-tenant por `franchiseId/storeId` via path resolvers.
- Shared types/schemas em `shared/` com cópia para `admin/shared` via `admin/copy-shared.js`.

## 10. Roadmap Técnico (sugerido)

Prioridade P0:

- Remover segredos versionados (`.env`, `admin/.env`) do controle de versão e rotacionar chaves.

Prioridade P1:

- Fechar inconsistência de pipeline de testes (logs com pass + `EXIT:1`).
- Padronizar canal único de feedback visual (há uso misto `use-toast` e `sonner` no Kiosk/Admin).

Prioridade P2:

- Reduzir duplicação de `shared` (hoje copiado para `admin/shared` via script de prebuild).
- Consolidar documentação operacional em UTF-8 (há arquivos com encoding inconsistente).

---

## Evidências principais (atalho)

- Apps/rotas: `admin/src/App.tsx`, `src/App.tsx`
- DB paths: `firestore.rules`, `admin/src/lib/pathResolver.ts`, `src/lib/pathResolver.ts`
- Auditoria: `admin/src/pages/audit/AuditPage.tsx`, `admin/src/services/auditService.ts`, `functions/src/auth/claims.ts`
- Backend exports: `functions/src/index.ts`
- Deploy: `firebase.json`, `vercel.json`, `admin/vercel.json`
- Hardware: `src/services/esp32CommunicationService.ts`, `src/services/esp32SerialService.ts`, `android/app/src/main/AndroidManifest.xml`, `firmware/firmware.ino`
