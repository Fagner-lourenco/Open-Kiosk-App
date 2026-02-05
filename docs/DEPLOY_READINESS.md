# Deploy Readiness - Open-Kiosk-App

Data: 2026-02-05
Escopo: somente runtime de producao (`src/`, `admin/src/`, `functions/src/`, `android/`, `firebase.*`, `shared/`).

## Baseline (executado)

### Root
- `npm run lint` - OK
  ```text
  > open-kiosk-app@1.0.0 lint
  > eslint .
  ```
- `npm run build` - OK (com warnings de chunk size)
  ```text
  > open-kiosk-app@1.0.0 build
  > vite build
  (!) Some chunks are larger than 1600 kB after minification.
  ```
- `npm run test` - OK
  ```text
  Test Files  10 passed (10)
       Tests  634 passed (634)
  ```

### Admin
- `npm run lint` - OK
  ```text
  > open-kiosk-admin@1.0.0 lint
  > eslint .
  ```
- `npm run build` - OK (com warning de chunk size)
  ```text
  > open-kiosk-admin@1.0.0 build
  > tsc && vite build
  (!) Some chunks are larger than 500 kB after minification.
  ```
- `npm run test` - OK
  ```text
  Test Files  1 passed (1)
       Tests  1 passed (1)
  ```

### Functions
- `npm run build` - OK
  ```text
  > open-kiosk-functions@1.0.0 build
  > tsc
  ```
- `npm run test` - OK
  ```text
  Test Files  1 passed (1)
       Tests  3 passed (3)
  ```

## Alertas (nao bloqueantes)

1. Vite reportou chunks grandes em `root` e `admin`.
2. Avisos de dynamic import: `src/services/firebase.ts` e `src/services/authService.ts` sao importados de forma estatica e dinamica.

## PagBank Setup (Functions config)

- `pagbank.env` = `sandbox` | `production`
- `pagbank.auth_token` (token padrao)
- `pagbank.auth_token_sandbox` (opcional, override sandbox)
- `pagbank.auth_token_production` (opcional, override production)
- `pagbank.webhook_token` (token para validar `x-authenticity-token`)
- `pagbank.webhook_url` (URL do webhook PagBank)

Segredos nunca devem ser salvos no Firestore. Configure via Functions config/Secret Manager.

## Payment Gateway Architecture

Ver `docs/PAYMENT_GATEWAY_ARCHITECTURE.md` (schema canonico, fluxo e migracao).

## Console errors (status)

- Corrigido: `useAuth deve ser usado dentro de AuthContextProvider` (AuthGate agora sempre sob Provider).
- Corrigido: `Firestore Listen 400` quando firebaseConfig vazio (guard de inicializacao).
- Dev-only/HMR: tratar como efeito cascata (sem falha de runtime restante).
- Ambiente: CORS do Kaspersky (documentado como mitigacao local).

## Checklist de deploy

- [x] Root: lint/build/test
- [x] Admin: lint/build/test
- [x] Functions: build/test
- [ ] `firebase deploy --only firestore:rules` (se rules alteradas)
- [ ] `firebase deploy --only firestore:indexes` (se indexes alterados)
- [ ] `firebase deploy --only functions` (PagBank + migrations)
- [ ] Executar migracao `consolidatePaymentGatewayConfig` (dry-run -> commit)
- [ ] Smoke: login + selecao franquia/loja (Admin e Kiosk)
- [ ] Smoke: registrar pedido no Kiosk e validar em `orders` no Admin
- [ ] Smoke: metrics/dailyStats atualizando apos venda

## Observacoes

- `dist/` e `coverage/` sao gerados por build/test e nao devem ser versionados para deploy.
