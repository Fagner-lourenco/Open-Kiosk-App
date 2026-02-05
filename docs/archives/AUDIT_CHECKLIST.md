#  CHECKLIST COMPLETO DE AUDITORIA

## Status Geral
- [x] Mapeamento de Arquivos: 100% (367 arquivos identificados)
- [ ] Auditoria de Código: 0% (iniciando)
- [ ] Grafo de Dependências: 0% (após bugs + dead code)

## FIRMWARE (ESP32)  1 arquivo
- [ ] firmware/firmware.ino (2361 linhas)  CRÍTICO

## FRONTEND - src/ (TypeScript/React)  ~150 arquivos

### Services (6 arquivos)
- [x] src/services/esp32CommunicationService.ts  Bug #1 identificado
- [x] src/services/esp32SerialService.ts  Analisado
- [ ] src/services/paymentService.ts
- [ ] src/services/hardwareStatusService.ts
- [ ] src/services/syncService.ts
- [ ] src/services/storageService.ts

### Context (4 arquivos)
- [x] src/context/ESP32Context.tsx  Analisado
- [ ] src/context/AuthContext.tsx
- [ ] src/context/ThemeContext.tsx
- [ ] src/context/ConfigContext.tsx

### Hooks (12+ arquivos  2600 linhas)
- [x] src/hooks/useESP32AutoConnect.ts  Analisado
- [x] src/hooks/useESP32Reconnect.ts  Analisado
- [x] src/hooks/usePermissions.ts  Analisado
- [x] src/hooks/useNetworkStatus.ts  Analisado (parcial)
- [x] src/hooks/useMercadoPagoPolling.ts  Analisado (parcial)
- [x] src/hooks/useKioskIdle.ts  Analisado
- [ ] src/hooks/useCheckoutFlow.ts
- [ ] src/hooks/useCachedVideo.ts
- [ ] src/hooks/useConfigImport.ts
- [ ] src/hooks/useDebounce.ts
- [ ] src/hooks/useDispensers.ts
- [ ] src/hooks/useMercadoPagoCheckout.ts
- [ ] src/hooks/useAdminPin.ts
- [ ] src/hooks/use-toast.ts

### Components (50+ arquivos  ~7000 linhas)
- [x] src/components/ESP32DispenserPanel.tsx  Parcial
- [ ] src/components/AdminAccess.tsx
- [ ] src/components/AdminAddProduct.tsx
- [ ] src/components/AdminDispensers.tsx
- [ ] src/components/AdminOrders.tsx
- [ ] src/components/AdminOverview.tsx
- [ ] src/components/AdminPaymentGatewayHub.tsx
- [ ] src/components/AdminProducts.tsx
- [ ] src/components/AdminReports.tsx
- [ ] src/components/AdminSecretAccess.tsx
- [ ] src/components/AdminSettings.tsx
- [ ] src/components/AdminSidebar.tsx
- [ ] src/components/AttractScreen.tsx
- [ ] src/components/Cart.tsx
- [ ] [40+ componentes pendentes]

### Pages (15+ arquivos)
- [ ] src/pages/*  (15 páginas / rotas)

### Types & Schemas (5 arquivos)
- [ ] src/types/index.ts
- [ ] src/types/esp32.ts
- [ ] src/types/mercadopago.ts
- [ ] shared/types/permissions.ts
- [ ] shared/schemas/store.schema.ts

### Config & Utils (10+ arquivos)
- [ ] src/config/* (4 arquivos)
- [ ] src/utils/* (8+ arquivos)
- [ ] src/i18n/* (2 arquivos)
- [ ] src/integrations/* (3 arquivos)

## BACKEND - functions/ (TypeScript/Cloud Functions)  12 arquivos
- [x] functions/src/auth/claims.ts  Analisado (parcial)
- [x] functions/src/billing/stripeWebhook.ts  Analisado (parcial)
- [ ] functions/src/auth/onCreate.ts
- [ ] functions/src/auth/setCustomClaims.ts
- [ ] functions/src/superadmin/setSuperAdmin.ts
- [ ] functions/src/superadmin/promoteSuperAdminHTTP.ts
- [ ] functions/src/invitations/sendEmail.ts
- [ ] functions/src/invitations/accept.ts
- [ ] functions/src/billing/createCheckout.ts
- [ ] functions/src/analytics/aggregateDailySales.ts
- [ ] functions/src/analytics/aggOrders.ts
- [ ] functions/src/index.ts

## FIREBASE
- [x] firestore.rules (769 linhas)  Analisado (segurança RBAC)
- [ ] firestore.indexes.json

## ADMIN APP  admin/ (TypeScript/React)  ~80 arquivos
- [ ] admin/src/*  (80+ arquivos, similar ao frontend)

## ANDROID
- [ ] android/app/src/*  (Java/Kotlin natives)

## CONFIG & ROOT  (10+ arquivos)
- [ ] package.json
- [ ] tsconfig.json
- [ ] vite.config.ts
- [ ] capacitor.config.ts
- [ ] tailwind.config.ts
- [ ] eslint.config.js
- [ ] firebase.json

---

##  BUGS CONFIRMADOS (Prioridade Executiva)

###  CRÍTICO: Bug #1  JSON Parser sem escape strings
**Arquivo:** src/services/esp32CommunicationService.ts (linhas 127-160)
**Status:** CONFIRMADO  Impacto ALTO
**Descrição:** extractCompleteJsons() conta { / } sem considerar strings, corrompe JSON com caracteres especiais
**Ação:** FIX HOJE  2-3h + testes

###  MODERADO: Bug #2  Parsing duplo JSON
**Arquivo:** firmware/firmware.ino (linha ~450)
**Status:** CONFIRMADO  Impacto MÉDIO
**Descrição:** Recursão desnecessária em JSON duplamente encapsulado
**Ação:** Documentar ou remover  1h

###  MODERADO: Bug #3  USB import frágil
**Arquivo:** src/services/esp32CommunicationService.ts (linha ~250)
**Status:** CONFIRMADO  Impacto MÉDIO
**Descrição:** Sem fallback para module.default em dynamic import
**Ação:** Adicionar fallback  30min

---

##  CÓDIGO MORTO (Candidatos)
(Será preenchido após grafo de dependências completo)

---

##  INVESTIGAÇÕES DESCARTADAS (6 total)
-  ISRs race condition  SEGURO (ops atômicas)
-  Regex gulosa serial  LIMITADA por linhas
-  Memory leak MercadoPago  LRU 50 entries cobre
-  useKioskIdle listeners  Ref protection cobre
-  Heartbeat deadlock  Non-blocking OK
- (Ver detalhes em audit_memory.md)

---

##  MAPA ARQUITETURAL
(Ver seções em audit_memory.md)

---

**Última atualização:** 2026-01-22
