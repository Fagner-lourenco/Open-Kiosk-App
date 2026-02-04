# 🧹 Relatório de Código Morto e Duplicado — Open-Kiosk-App

**Data:** 22 de janeiro de 2026  
**Análise:** Verificação manual de imports/exports  
**Status:** ✅ LIMPEZA CONCLUÍDA

---

## 📊 RESULTADO DA LIMPEZA

| Ação | Quantidade | Status |
|------|------------|--------|
| Componentes removidos | 11 arquivos | ✅ DELETADOS |
| Hooks removidos | 1 arquivo | ✅ DELETADO |
| Pasta vazia removida | 1 diretório | ✅ DELETADA |
| Falsos positivos identificados | 8 itens | ✅ MANTIDOS |
| Erros após limpeza | 0 | ✅ BUILD OK |

---

## ✅ ARQUIVOS REMOVIDOS

### Componentes (11 arquivos):
- `src/components/AdminAddProduct.tsx` ✅
- `src/components/AdminDispensers.tsx` ✅
- `src/components/AdminSidebar.tsx` ✅
- `src/components/Chart.tsx` ✅
- `src/components/ESP32ConnectionPanel.tsx` ✅
- `src/components/ESP32TestPanel.tsx` ✅
- `src/components/Sidebar.tsx` ✅
- `src/components/StatsCard.tsx` ✅
- `src/components/UserTable.tsx` ✅
- `src/components/SizeSelectorModal.tsx` ✅
- `src/components/icons/BeerMug.tsx` ✅

### Hooks (1 arquivo):
- `src/hooks/useMercadoPagoCheckout.ts` ✅

### Diretórios (1 pasta):
- `functions/src/hardware/` ✅

---

## 🟢 FALSOS POSITIVOS — MANTIDOS CORRETAMENTE

| Arquivo | Motivo para Manter |
|---------|-------------------|
| `src/components/ProtectedRoute.tsx` | Usado por admin/src/App.tsx |
| `src/components/Header.tsx` | Componente diferente do admin |
| `src/components/ui/Can.tsx` | Usado internamente |
| `src/hooks/usePermissions.ts` | Usado por Can.tsx e ProtectedRoute.tsx |
| `src/services/storeService.ts` | Usado por StoreContext, StoreInitialization |
| Componentes `ui/*` Shadcn | Biblioteca de design system |
| `admin/src/pages/SettingsPage.tsx` | Em uso no App.tsx |
| `src/services/kioskSettingsService.ts` | Avaliar uso futuro |

---

## � CÓDIGO DUPLICADO — REFATORADO ✅

### Cloud Functions: Módulos Centralizados Criados

**Novos módulos em `functions/src/lib/`:**

| Módulo | Função | Substitui |
|--------|--------|-----------|
| `firebase.ts` | Inicialização única de Firebase Admin | 10 ocorrências |
| `auth.ts` | Helpers de autenticação (`requireAuth`, `requireRole`, etc) | 13 ocorrências |
| `claims.ts` | Manipulação de custom claims (`setUserClaims`, etc) | 9 ocorrências |
| `stripe.ts` | Cliente Stripe centralizado | 2 ocorrências |
| `index.ts` | Barrel export para imports simplificados | — |

**Arquivos refatorados para usar `lib/`:**
- ✅ `auth/setCustomClaims.ts`
- ✅ `auth/onCreate.ts`
- ✅ `auth/claims.ts`
- ✅ `billing/createCheckout.ts`
- ✅ `billing/stripeWebhook.ts`
- ✅ `invitations/accept.ts`
- ✅ `invitations/sendEmail.ts`
- ✅ `analytics/aggOrders.ts`
- ✅ `analytics/aggregateDailySales.ts`

**Exemplo de uso simplificado:**
```typescript
// Antes (duplicado em cada arquivo):
import * as admin from 'firebase-admin';
if (!admin.apps.length) { admin.initializeApp(); }
const db = admin.firestore();
if (!context.auth) { throw new HttpsError('unauthenticated'...) }

// Depois (centralizado):
import { db, requireAuth, serverTimestamp } from '../lib';
requireAuth(context);
```
```

**Solução:**
```typescript
// Criar: functions/src/lib/auth.ts
export function requireAuth(context: CallableContext): void {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }
}
```

---

#### 1.3 Lógica de SuperAdmin (2 arquivos duplicados)
- `functions/src/superadmin/setSuperAdmin.ts`
- `functions/src/superadmin/promoteSuperAdminHTTP.ts`

Mesma lógica: cria doc em `superadmins` + `users` + `setCustomUserClaims`

**Solução:** Extrair para `functions/src/superadmin/lib.ts`

---

#### 1.4 Stripe Client (2 ocorrências)
- `functions/src/billing/createCheckout.ts`
- `functions/src/billing/stripeWebhook.ts`

**Solução:** Criar `functions/src/lib/stripe.ts`

---

### 2. Tipos Duplicados entre Admin e Src

| Tipo | Locais | Problema |
|------|--------|----------|
| `Store` interface | `admin/src/types/`, `src/types/`, `shared/types/` | **3 definições diferentes** |
| `User` interface | `admin/src/services/`, `src/types/` | Estruturas divergentes |
| `Franchise` interface | Inline em múltiplos services | Deveria estar em `shared/` |

**Solução:** Migrar TUDO para `shared/types/` e importar de lá

---

### 3. Componentes UI Shadcn Duplicados (Esperado)

| Componente | Admin | Src |
|------------|-------|-----|
| button.tsx | ✅ | ✅ |
| card.tsx | ✅ | ✅ |
| dialog.tsx | ✅ | ✅ |
| dropdown-menu.tsx | ✅ | ✅ |
| input.tsx | ✅ | ✅ |
| select.tsx | ✅ | ✅ |
| table.tsx | ✅ | ✅ |
| tabs.tsx | ✅ | ✅ |

**Nota:** Duplicação esperada em monorepo. Considerar npm workspace futuro.

---

## 📋 EXPORTS MORTOS POR SERVICE

### src/services/videoCacheService.ts
- `getCachedVideoUrl` — 0 imports
- `isVideoCached` — 0 imports  
- `removeVideoFromCache` — 0 imports
- `clearVideoCache` — 0 imports
- `getVideoCacheSize` — 0 imports

### src/services/cacheService.ts
- `cleanupExpiredCache` — 0 imports externos
- `getCacheStats` — 0 imports
- `invalidateCacheByPattern` — 0 imports
- `CacheItem` type — 0 imports

### src/services/esp32BluetoothService.ts
- `BluetoothDevice` interface — 0 imports
- `BluetoothError` interface — 0 imports

### src/services/esp32CommunicationService.ts
- `ESP32_COMMANDS` — 0 imports
- `ESP32_EVENTS` — 0 imports
- `CommandOptions` type — 0 imports

### src/services/esp32SerialService.ts
- `SerialPortInfo` interface — 0 imports
- `SerialConnectionState` type — 0 imports

### src/services/orderService.ts
- `getOrderHistory` — 0 imports
- `updateOrderStatus` — 0 imports
- `cancelOrder` — 0 imports
- `getOrdersByDateRange` — 0 imports

### src/services/salesService.ts
- `getSalesHistory` — 0 imports
- `getSalesByPaymentMethod` — 0 imports
- `getSalesByProduct` — 0 imports

---

## 🎯 PLANO DE LIMPEZA

### Sprint 1 — Remoção de Código Morto (1 dia)
```bash
# Componentes principais
rm src/components/ActivityFeed.tsx
rm src/components/AdminAddProduct.tsx
rm src/components/AdminDispensers.tsx
rm src/components/AdminSidebar.tsx
rm src/components/Chart.tsx
rm src/components/ESP32ConnectionPanel.tsx
rm src/components/ESP32TestPanel.tsx
rm src/components/Header.tsx
rm src/components/ProtectedRoute.tsx
rm src/components/Sidebar.tsx
rm src/components/SizeSelectorModal.tsx
rm src/components/StatsCard.tsx
rm src/components/UserTable.tsx
rm src/components/icons/BeerMug.tsx

# Hooks mortos
rm src/hooks/useFirebaseReports.ts
rm src/hooks/usePermissions.ts

# UI não usados
rm src/components/ui/breadcrumb.tsx
rm src/components/ui/Can.tsx
rm src/components/ui/carousel.tsx
rm src/components/ui/context-menu.tsx
rm src/components/ui/drawer.tsx
rm src/components/ui/hover-card.tsx
rm src/components/ui/input-otp.tsx
rm src/components/ui/menubar.tsx
rm src/components/ui/navigation-menu.tsx
rm src/components/ui/pagination.tsx
rm src/components/ui/radio-group.tsx
rm src/components/ui/resizable.tsx
rm src/components/ui/slider.tsx
rm src/components/ui/toggle.tsx
rm src/components/ui/toggle-group.tsx

# Páginas admin obsoletas
rm admin/src/pages/SettingsPage.tsx
rm admin/src/pages/CatalogsPage.tsx

# Pasta vazia
rmdir functions/src/hardware
```

### Sprint 2 — Refatoração Functions (2 dias)
1. Criar `functions/src/lib/firebase.ts`
2. Criar `functions/src/lib/auth.ts`
3. Criar `functions/src/lib/stripe.ts`
4. Criar `functions/src/superadmin/lib.ts`
5. Atualizar imports em todos os arquivos

### Sprint 3 — Unificação de Tipos (1 dia)
1. Mover todos os tipos para `shared/types/`
2. Atualizar imports em `admin/` e `src/`
3. Remover tipos duplicados

---

## 📈 IMPACTO ESTIMADO

| Métrica | Antes | Depois | Redução |
|---------|-------|--------|---------|
| Linhas de código | ~50.000 | ~45.000 | ~10% |
| Arquivos componentes | 80 | 51 | ~36% |
| Arquivos hooks | 21 | 19 | ~10% |
| Patterns duplicados | 35+ | 5 | ~86% |

---

## ⚠️ AVISOS

1. **Antes de deletar**, verificar se componentes são usados em rotas lazy/dynamic
2. **Componentes UI Shadcn** podem ser usados no futuro — considerar manter
3. **Services com exports mortos** podem ter exports usados internamente — revisar
4. **Fazer backup** antes de remoções em massa
