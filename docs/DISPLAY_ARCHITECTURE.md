# Arquitetura de Display — Kiosk vs TV

## Visão Geral

O Open Kiosk utiliza **duas aplicações separadas** para os dois modos de exibição:

| Modo | App | Diretório | Deployment |
|------|-----|-----------|------------|
| **Kiosk (Self-Service)** | App Capacitor/PWA | `src/` | APK Android (Capacitor) ou PWA |
| **TV Dashboard (Telão)** | Rota pública do Admin | `admin/src/pages/ranking/` | Web (browser fullscreen) |

## Kiosk App (`src/`)

**Propósito:** Totem de autoatendimento onde o cliente interage diretamente (self-pour, pedidos, ranking).

- **Build:** Vite + React + Capacitor (Android nativo)
- **Config:** `capacitor.config.ts`, `vite.config.ts` (VitePWA habilitado)
- **Event Mode:** Lê `franchises/{fId}/stores/{sId}/eventStats/current` via `useStoreSettings` (onSnapshot real-time)
- **Attract Mode:** Exibe vídeo de atração quando ocioso — config em `attractVideoConfig` na store settings
- **Tipos relevantes:**
  - `src/types/store.ts` → `eventMode?: { enabled, label, endsAt, activateDynamicPricing }`
  - `src/types/store.ts` → `attractVideoConfig?: SharedAttractVideoConfig`
- **Dynamic Pricing:** Ativado via `useDynamicPrice.ts` quando `eventMode.enabled && activateDynamicPricing`

## TV Dashboard (`admin/`)

**Propósito:** Telão de ranking/placar exibido em TV conectada, sem interação do usuário.

- **Rota:** `/ranking/display/:storeId` (pública, sem autenticação)
- **Componente:** `admin/src/pages/ranking/TvDashboardPage.tsx`
- **Hook:** `admin/src/hooks/useTvDashboard.ts` (onSnapshot real-time)
- **Firestore path:** `franchises/{fId}/stores/{sId}/tvConfig/current`
- **Configuração:** `admin/src/pages/ranking/EventConfigPage.tsx` (3 tabs: Config TV, Desafios, Prêmios)
- **Tipos:** `admin/src/types/tvDashboard.ts`

## Paths Firestore

```
franchises/{fId}/stores/{sId}/
  ├── eventStats/current          ← Kiosk lê (eventMode)
  ├── tvConfig/current            ← TV lê (layout, desafios, prêmios)
  └── settings/config             ← Ambos leem (attractVideoConfig, etc.)
```

## Cloud Functions Relacionadas

| Function | Tipo | Descrição |
|----------|------|-----------|
| `toggleEventMode` | Callable | Ativa/desativa eventMode no kiosk (escreve em `eventStats/current`) |
| `expireEventMode` | Scheduled | Expira eventMode automaticamente quando `endsAt` passa |
| `recalculateRanking30min` | Scheduled | Recalcula ranking TV a cada 30min |
| `expirePrizes` | Scheduled | Expira prêmios do ranking |
| `expireChallenges` | Scheduled | Expira desafios do ranking |

## Decisão Arquitetural

**Status:** Decisão tomada — manter como aplicações separadas.

**Justificativa:**
- Kiosk é app nativa Android (Capacitor) otimizada para touch/self-service
- TV é browser fullscreen sem interação, otimizado para exibição passiva
- Compartilham dados via Firestore, mas UX e requisitos são completamente distintos
- Unificar adicionaria complexidade sem benefício claro
