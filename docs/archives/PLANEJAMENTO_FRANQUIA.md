# 🏢 Planejamento Técnico: Evolução para Modelo Multi-Franquia

**Projeto:** Open Kiosk App  
**Versão do Documento:** 1.0  
**Data:** 18 de Janeiro de 2026  
**Autor:** Equipe Open Kiosk

---

## 📋 Sumário

1. [Análise da Arquitetura Atual](#1-análise-da-arquitetura-atual)
2. [Nova Arquitetura Multi-Franquia](#2-nova-arquitetura-multi-franquia)
3. [Estrutura de Dados Proposta](#3-estrutura-de-dados-proposta)
4. [Diagrama Lógico do Sistema](#4-diagrama-lógico-do-sistema)
5. [FASE 1 - Arquivos a Modificar](#5-fase-1---arquivos-a-modificar)
6. [FASE 2 - Arquivos a Criar (Admin App)](#6-fase-2---arquivos-a-criar-admin-app)
7. [Fluxo de Autenticação](#7-fluxo-de-autenticação)
8. [Fluxo de Login no Kiosk](#8-fluxo-de-login-no-kiosk)
9. [Fluxo de Permissões](#9-fluxo-de-permissões)
10. [Roadmap Técnico por Etapas](#10-roadmap-técnico-por-etapas)
11. [Estimativa de Complexidade](#11-estimativa-de-complexidade)
12. [Riscos Técnicos](#12-riscos-técnicos)

---

## 1. Análise da Arquitetura Atual

### 1.1 Visão Geral

O Open Kiosk App é uma aplicação PWA/Capacitor para quiosques de autoatendimento com:
- Interface de vendas para clientes (Shop)
- Painel administrativo para gerenciar produtos, estoque e vendas
- Integração com hardware ESP32 para dispensação de bebidas
- Integração com Mercado Pago (PIX QR e Terminal Point)
- Suporte offline-first com sincronização background

### 1.2 Stack Tecnológica Atual

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | React 18.3 + TypeScript 5.5 + Vite 5.4 |
| **UI** | Tailwind CSS + Radix UI (shadcn/ui) |
| **Estado** | React Context + TanStack Query |
| **Backend** | Firebase Firestore + Firebase Auth (não usado) |
| **Mobile** | Capacitor 8.0 (Android) |
| **Hardware** | ESP32-S3 via Web Serial / BLE / WiFi |
| **Pagamentos** | Mercado Pago API |

### 1.3 Estrutura de Arquivos Atual

```
src/
├── App.tsx                          # Componente raiz
├── main.tsx                         # Entry point
├── components/                      # 40+ componentes
│   ├── AdminSidebar.tsx             # Menu lateral admin
│   ├── AdminSecretAccess.tsx        # Gesto secreto + PIN
│   ├── StoreInitialization.tsx      # Setup inicial
│   ├── ProtectedRoute.tsx           # Guard de rotas (não usado)
│   ├── ProductGrid.tsx              # Grid de produtos
│   ├── Cart.tsx                     # Carrinho
│   ├── Checkout.tsx                 # Fluxo de pagamento
│   ├── DrinkPickupScreen.tsx        # Tela de retirada
│   ├── ESP32ConnectionPanel.tsx     # Conexão ESP32
│   └── ... (outros componentes)
├── context/
│   ├── AuthContext.tsx              # Autenticação via PIN
│   ├── StoreContext.tsx             # Loja atual
│   ├── ESP32Context.tsx             # Estado ESP32
│   └── PaymentGatewayContext.tsx    # Config de pagamentos
├── hooks/                           # 19 hooks customizados
│   ├── useStoreSettings.tsx         # Settings da loja
│   ├── useFirebaseProducts.tsx      # CRUD produtos
│   ├── useFirebaseReports.tsx       # Relatórios
│   ├── useAdminPin.ts               # Validação PIN
│   ├── useCheckoutFlow.ts           # Máquina de estados
│   └── ... (outros hooks)
├── services/
│   ├── firebase.ts                  # Inicialização Firebase
│   ├── storeService.ts              # CRUD de lojas
│   ├── salesService.ts              # Registro de vendas
│   ├── paymentService.ts            # Mercado Pago
│   ├── esp32Communication.ts        # Multi-protocolo ESP32
│   ├── cacheService.ts              # IndexedDB
│   └── ... (outros serviços)
├── types/
│   ├── store.ts                     # Store, StoreSettings
│   ├── product.ts                   # Product, CartItem
│   ├── sales.ts                     # Sale, PaymentMethod
│   └── ... (outros tipos)
├── pages/
│   ├── Index.tsx                    # Landing page
│   ├── Admin.tsx                    # Dashboard admin
│   ├── Shop.tsx                     # Interface de vendas
│   └── NotFound.tsx                 # 404
└── lib/
    └── firebase.ts                  # Helpers Firestore
```

### 1.4 Estrutura Firestore Atual

```
📦 Firestore Database (Single-Tenant)
│
└── 📂 stores/{storeId}
    ├── storeId: string
    ├── name: string
    ├── slug: string
    ├── isActive: boolean
    ├── currency: string ("BRL")
    ├── language: string ("pt-BR" | "en")
    ├── taxId?: string
    ├── taxPercentage: number
    ├── attractTimeoutSeconds: number
    ├── useThermalPrinter: boolean
    ├── created_at: Timestamp
    ├── updated_at: Timestamp
    │
    ├── 📂 products/{productId}
    │   ├── id, title, price, description
    │   ├── image, category, tags[]
    │   ├── inStock, stock, minStock
    │   ├── isDrink, sizes[], totalMlAvailable
    │   └── createdAt, updatedAt
    │
    ├── 📂 sales/{saleId}
    │   ├── orderNumber
    │   ├── storeId
    │   ├── items[]
    │   ├── subtotal, tax, total
    │   ├── paymentMethod
    │   ├── currency
    │   └── timestamp, timing data
    │
    └── 📂 settings/config
        ├── paymentGatewayConfig
        └── updatedAt
```

### 1.5 Fluxo de Autenticação Atual

```
┌─────────────────────────────────────────────────────────────────┐
│                  AUTENTICAÇÃO ATUAL (PIN)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐                                           │
│  │ AdminSecretAccess│ ─── Detecta 5 cliques rápidos (<500ms)   │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  Modal de PIN   │ ─── Usuário digita PIN                    │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │   useAdminPin   │ ─── Valida com PBKDF2 (100k iterações)    │
│  │                 │     Rate limiting: 5 tentativas            │
│  │                 │     PIN root: VITE_ROOT_PIN (env)          │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │   AuthContext   │ ─── setIsAuthenticated(true)               │
│  │                 │     Sessão de 30 min com timeout           │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │   /admin route  │ ─── Acesso ao painel administrativo       │
│  └─────────────────┘                                           │
│                                                                 │
│  ⚠️ NOTA: ProtectedRoute existe mas NÃO está sendo usado       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.6 Pontos Fortes da Arquitetura Atual

| Aspecto | Descrição |
|---------|-----------|
| ✅ **Offline-First** | IndexedDB + localStorage + Firebase cache habilitado |
| ✅ **Multi-Store Ready** | Helpers `getStoreCollection()`, `getStoreDoc()` já implementados |
| ✅ **Config Dinâmica** | PaymentGatewayConfig por loja já funciona |
| ✅ **Contextos Separados** | Auth, Store, ESP32, Payment bem isolados |
| ✅ **Hooks Reutilizáveis** | Boa abstração de lógica de negócio |
| ✅ **Hardware Integrado** | ESP32 funcionando via USB/BLE/WiFi |
| ✅ **Internacionalização** | i18n com pt-BR e en implementado |

### 1.7 Pontos de Atenção

| Aspecto | Problema | Impacto |
|---------|----------|---------|
| ⚠️ **PIN Único** | Apenas um PIN global (env var) | Não suporta múltiplos usuários |
| ⚠️ **Sem Firebase Auth** | Autenticação não usa Firebase Auth | Não há usuários persistidos |
| ⚠️ **Setup Hardcoded** | Assume 1 loja por dispositivo | Não suporta troca de loja |
| ⚠️ **Sem RBAC** | Apenas admin/não-admin | Não suporta roles granulares |
| ⚠️ **Sem Auditoria** | Ações não são logadas | Difícil rastrear mudanças |

---

## 2. Nova Arquitetura Multi-Franquia

### 2.1 Modelo de Aplicações

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ARQUITETURA DUAL-APP                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐         │
│  │    📱 APP OPERACIONAL       │    │    🌐 APP WEB ADMIN          │         │
│  │    (Open Kiosk App)         │    │    (Open Kiosk Admin)        │         │
│  │    >>> ESTE REPOSITÓRIO <<< │    │    >>> NOVO PROJETO <<<      │         │
│  ├─────────────────────────────┤    ├─────────────────────────────┤         │
│  │                             │    │                             │         │
│  │ • Login simples (email)     │    │ • Login completo            │         │
│  │ • PIN offline (fallback)    │    │ • Registro de franquia      │         │
│  │ • Seletor de loja           │    │ • Seletor franquia/loja     │         │
│  │ • PDV / Shop                │    │ • Dashboard franquia        │         │
│  │ • Checkout                  │    │ • Gestão de lojas           │         │
│  │ • Dashboard da LOJA         │    │ • Gestão de usuários        │         │
│  │ • Produtos/Estoque          │    │ • Convites e RBAC           │         │
│  │ • ESP32 / Torneiras         │    │ • Billing e planos          │         │
│  │ • Gateway pagamento         │    │ • Relatórios consolidados   │         │
│  │ • Offline-first             │    │ • Auditoria                 │         │
│  │                             │    │                             │         │
│  └──────────────┬──────────────┘    └──────────────┬──────────────┘         │
│                 │                                   │                        │
│                 └───────────────┬───────────────────┘                        │
│                                 │                                            │
│                                 ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    🔥 FIREBASE (Compartilhado)                         │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │  │
│  │  │  Firebase    │  │  Firestore   │  │   Cloud      │                 │  │
│  │  │    Auth      │  │  Database    │  │  Functions   │                 │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                 │  │
│  │                                                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │  │
│  │  │                    FIRESTORE RULES (RBAC)                         │ │  │
│  │  │  • Isolamento por franchiseId                                    │ │  │
│  │  │  • Validação de storeAccess                                      │ │  │
│  │  │  • Permissões por role                                           │ │  │
│  │  └──────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Hierarquia de Usuários

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HIERARQUIA DE USUÁRIOS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OWNER (Franqueador / Dono da Plataforma)                                   │
│  ├── Pode: Criar franquias, gerenciar billing, ver tudo                    │
│  ├── Escopo: Todas as lojas da franquia                                     │
│  └── Acesso: App Admin (Web)                                                │
│                                                                              │
│  ADMIN (Administrador da Franquia)                                          │
│  ├── Pode: Gerenciar lojas, usuários, produtos, relatórios                 │
│  ├── Escopo: Todas as lojas da franquia                                     │
│  └── Acesso: App Admin (Web) + App Kiosk (se necessário)                   │
│                                                                              │
│  MANAGER (Gerente de Loja)                                                  │
│  ├── Pode: Gerenciar produtos, estoque, relatórios da loja                 │
│  ├── Escopo: Apenas lojas atribuídas (storeAccess[])                       │
│  └── Acesso: App Kiosk (/admin + /shop)                                     │
│                                                                              │
│  OPERATOR (Operador de Caixa)                                               │
│  ├── Pode: Apenas usar o PDV (vendas)                                       │
│  ├── Escopo: Apenas lojas atribuídas                                        │
│  └── Acesso: App Kiosk (/shop apenas)                                       │
│                                                                              │
│  TECHNICIAN (Técnico)                                                       │
│  ├── Pode: Configurar ESP32 e hardware                                      │
│  ├── Escopo: Apenas lojas atribuídas                                        │
│  └── Acesso: App Kiosk (/admin/esp32 + /admin/dispensers)                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Matriz de Permissões

```
┌──────────────────┬─────────┬─────────┬─────────┬──────────┬────────────┐
│    Permissão     │  OWNER  │  ADMIN  │ MANAGER │ OPERATOR │ TECHNICIAN │
├──────────────────┼─────────┼─────────┼─────────┼──────────┼────────────┤
│ PDV / Vendas     │    ✅   │    ✅   │    ✅   │    ✅    │     ❌     │
│ Ver produtos     │    ✅   │    ✅   │    ✅   │    ✅    │     ❌     │
│ Editar produtos  │    ✅   │    ✅   │    ✅   │    ❌    │     ❌     │
│ Ver estoque      │    ✅   │    ✅   │    ✅   │    ❌    │     ❌     │
│ Ajustar estoque  │    ✅   │    ✅   │    ✅   │    ❌    │     ❌     │
│ Ver relatórios   │    ✅   │    ✅   │    ✅   │    ❌    │     ❌     │
│ Config. loja     │    ✅   │    ✅   │    ⚠️   │    ❌    │     ❌     │
│ Config. gateway  │    ✅   │    ✅   │    ❌   │    ❌    │     ❌     │
│ Conectar ESP32   │    ✅   │    ✅   │    ✅   │    ✅    │     ✅     │
│ Config. ESP32    │    ✅   │    ✅   │    ❌   │    ❌    │     ✅     │
│ Convidar usuário │    ✅   │    ✅   │    ⚠️   │    ❌    │     ❌     │
│ Remover usuário  │    ✅   │    ✅   │    ❌   │    ❌    │     ❌     │
│ Criar loja       │    ✅   │    ⚠️   │    ❌   │    ❌    │     ❌     │
│ Billing/Plano    │    ✅   │    ❌   │    ❌   │    ❌    │     ❌     │
└──────────────────┴─────────┴─────────┴─────────┴──────────┴────────────┘

✅ = Sempre permitido
⚠️ = Permitido apenas para lojas atribuídas
❌ = Não permitido
```

---

## 3. Estrutura de Dados Proposta

### 3.1 Nova Estrutura Firestore

```
📦 Firestore Database (Multi-Franchise)
│
├── 📂 users/{userId}                         # Autenticados via Firebase Auth
│   ├── email: string
│   ├── displayName: string
│   ├── photoURL?: string
│   ├── phone?: string
│   ├── defaultFranchiseId?: string           # Última franquia acessada
│   ├── defaultStoreId?: string               # Última loja acessada
│   ├── createdAt: Timestamp
│   ├── lastLoginAt: Timestamp
│   └── isActive: boolean
│
├── 📂 franchises/{franchiseId}
│   ├── name: string                          # "Açaí do João"
│   ├── slug: string                          # "acai-do-joao"
│   ├── ownerId: string                       # ref users/{userId}
│   ├── logoUrl?: string
│   ├── primaryColor?: string
│   ├── plan: 'starter' | 'growth' | 'enterprise'
│   ├── maxStores: number                     # Limite do plano
│   ├── maxUsersPerStore: number
│   ├── billingStatus: 'active' | 'past_due' | 'canceled' | 'trial'
│   ├── trialEndsAt?: Timestamp
│   ├── stripeCustomerId?: string
│   ├── features: string[]                    # Features habilitadas
│   ├── createdAt: Timestamp
│   ├── updatedAt: Timestamp
│   │
│   ├── 📂 members/{userId}                   # Subcollection de membros
│   │   ├── oderId: string                    # referência ao user
│   │   ├── role: 'owner' | 'admin' | 'manager' | 'operator' | 'technician'
│   │   ├── storeAccess: string[]             # ['store1', 'store2'] ou ['*']
│   │   ├── permissions: Permission[]          # Override granular
│   │   ├── invitedBy: string
│   │   ├── invitedAt: Timestamp
│   │   └── joinedAt: Timestamp
│   │
│   └── 📂 stores/{storeId}                   # Subcollection de lojas
│       ├── name: string
│       ├── slug: string
│       ├── address?: Address
│       ├── phone?: string
│       ├── email?: string
│       ├── timezone: string
│       ├── currency: string
│       ├── language: 'pt-BR' | 'en'
│       ├── taxId?: string
│       ├── taxPercentage: number
│       ├── isActive: boolean
│       ├── attractTimeoutSeconds: number
│       ├── useThermalPrinter: boolean
│       ├── esp32Config?: ESP32Config
│       ├── createdAt: Timestamp
│       ├── updatedAt: Timestamp
│       │
│       ├── 📂 products/{productId}           # (estrutura existente)
│       │   └── ... (mesmos campos atuais)
│       │
│       ├── 📂 sales/{saleId}                 # (estrutura existente + extras)
│       │   ├── ... (mesmos campos atuais)
│       │   ├── operatorId: string            # ← NOVO: quem processou
│       │   └── operatorName: string          # ← NOVO: nome do operador
│       │
│       ├── 📂 dispensers/{dispenserId}       # ← NOVO: torneiras
│       │   ├── name: string                  # "Torneira 1 - Chopp"
│       │   ├── icon?: string                 # emoji ou ícone
│       │   ├── connectionType: 'usb' | 'ble' | 'wifi'
│       │   ├── connectionId?: string         # Port/MAC/IP
│       │   ├── productIds: string[]          # Produtos vinculados
│       │   ├── isActive: boolean
│       │   └── lastSeen?: Timestamp
│       │
│       └── 📂 settings/config
│           ├── paymentGatewayConfig?: PaymentGatewayConfig
│           └── updatedAt: Timestamp
│
├── 📂 invitations/{inviteId}                 # Convites pendentes
│   ├── email: string
│   ├── franchiseId: string
│   ├── storeAccess: string[]
│   ├── role: string
│   ├── invitedBy: string
│   ├── status: 'pending' | 'accepted' | 'expired' | 'revoked'
│   ├── token: string                         # Token único para o link
│   ├── expiresAt: Timestamp
│   └── createdAt: Timestamp
│
├── 📂 roles/{roleId}                         # Templates de roles
│   ├── name: string
│   ├── description: string
│   ├── permissions: Permission[]
│   ├── isSystem: boolean                     # Não pode ser editado
│   └── franchiseId?: string                  # null = global, string = custom
│
└── 📂 audit_logs/{logId}                     # Logs de auditoria globais
    ├── userId: string
    ├── userEmail: string
    ├── franchiseId: string
    ├── storeId?: string
    ├── action: AuditAction
    ├── resource: string                      # 'products', 'sales', 'users'
    ├── resourceId?: string
    ├── changes?: { before: any, after: any }
    ├── ip?: string
    ├── userAgent?: string
    └── timestamp: Timestamp
```

### 3.2 Compatibilidade com Estrutura Atual

Para manter compatibilidade durante a migração, usaremos um **Path Resolver** com feature flag:

```typescript
// src/lib/pathResolver.ts

/**
 * Feature flag para habilitar modo franquia
 * Pode ser controlado via:
 * - localStorage('franchiseMode')
 * - import.meta.env.VITE_FRANCHISE_MODE
 */
export const franchiseMode = (): boolean => {
  return localStorage.getItem('franchiseMode') === 'true' 
      || import.meta.env.VITE_FRANCHISE_MODE === 'true';
};

/**
 * Retorna o path de uma subcollection da loja
 * 
 * franchiseMode = false: stores/{storeId}/products
 * franchiseMode = true:  franchises/{fid}/stores/{sid}/products
 */
export function storeSubPath(
  franchiseId: string | undefined, 
  storeId: string, 
  subcollection: 'products' | 'sales' | 'settings' | 'dispensers'
): string {
  if (franchiseMode() && franchiseId) {
    return `franchises/${franchiseId}/stores/${storeId}/${subcollection}`;
  }
  return `stores/${storeId}/${subcollection}`;
}
```

---

## 4. Diagrama Lógico do Sistema

### 4.1 Fluxo Geral

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUXO DO SISTEMA                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         APP KIOSK (OPERACIONAL)                          ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                          ││
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          ││
│  │  │  Login   │───▶│  Store   │───▶│   Shop   │───▶│ Checkout │          ││
│  │  │  Page    │    │ Selector │    │   PDV    │    │          │          ││
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘          ││
│  │       │               │               │               │                  ││
│  │       │ Firebase      │ Firestore     │ Firestore     │ MP API          ││
│  │       │ Auth          │ Query         │ Query         │ Payment         ││
│  │       ▼               ▼               ▼               ▼                  ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │                        FIREBASE                                  │    ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │                                                                          ││
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐                           ││
│  │  │  Admin   │◀───│ Gesto    │    │ Drink    │◀── ESP32                  ││
│  │  │Dashboard │    │ Secreto  │    │ Pickup   │    USB/BLE/WiFi           ││
│  │  └──────────┘    └──────────┘    └──────────┘                           ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         APP ADMIN (WEB) - FASE 2                         ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                          ││
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          ││
│  │  │  Login   │───▶│Franchise │───▶│Dashboard │───▶│  Users   │          ││
│  │  │ Register │    │ Selector │    │          │    │  Stores  │          ││
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘          ││
│  │       │               │               │               │                  ││
│  │       │ Firebase      │ Firestore     │ Firestore     │ Cloud           ││
│  │       │ Auth          │ Query         │ Aggregation   │ Functions       ││
│  │       ▼               ▼               ▼               ▼                  ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │                        FIREBASE                                  │    ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Navegação do App Kiosk

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    APP KIOSK - NAVEGAÇÃO (FASE 1)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  /login                    Login Firebase (email/senha)                      │
│  │                         PIN offline (fallback se sem internet)           │
│  │                                                                           │
│  ├── /store-select         Seletor de loja (se user tem > 1 loja)           │
│  │                                                                           │
│  └── /                     Área autenticada (requer loja selecionada)       │
│      │                                                                       │
│      ├── /shop             PDV / Catálogo (OPERATOR+)                       │
│      │   ├── Cart          Carrinho lateral                                  │
│      │   ├── Checkout      Pagamento (PIX/Cartão)                           │
│      │   └── DrinkPickup   Retirada de bebida                               │
│      │                                                                       │
│      └── /admin            Dashboard da LOJA (MANAGER+)                     │
│          ├── overview      KPIs da loja                                      │
│          ├── products      Gestão de produtos                                │
│          ├── add-product   Formulário de produto                            │
│          ├── inventory     Gestão de estoque                                 │
│          ├── orders        Histórico de pedidos                              │
│          ├── reports       Relatórios da loja                                │
│          ├── payments      Gateway de pagamento                              │
│          ├── dispensers    Configuração de torneiras                         │
│          ├── esp32         Conexão ESP32 (TECHNICIAN+)                       │
│          └── settings      Config. da loja                                   │
│                                                                              │
│  Permissões:                                                                 │
│  • OPERATOR     → /shop apenas                                              │
│  • TECHNICIAN   → /shop + /admin/dispensers + /admin/esp32                  │
│  • MANAGER      → /shop + /admin (completo)                                 │
│  • ADMIN/OWNER  → Tudo (geralmente usam o App Web Admin)                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. FASE 1 - Arquivos a Modificar

### 5.1 Arquivos Críticos (Alta Prioridade)

| Arquivo | Modificações | Complexidade | Impacto |
|---------|--------------|--------------|---------|
| **`src/context/AuthContext.tsx`** | Migrar para Firebase Auth, manter PIN como fallback offline, adicionar user data | 🔴 Alta | Toda a autenticação |
| **`src/context/StoreContext.tsx`** | Adicionar `franchiseId`, suportar múltiplas lojas por sessão | 🔴 Alta | Toda a navegação |
| **`src/components/StoreInitialization.tsx`** | Remover (substituído por LoginPage) ou simplificar para setup inicial apenas | 🟡 Média | Primeiro acesso |
| **`src/App.tsx`** | Adicionar rotas `/login`, `/store-select`, proteção de rotas | 🟡 Média | Estrutura de rotas |
| **`src/lib/firebase.ts`** | Adicionar helpers para franchises, usar pathResolver | 🟡 Média | Todas as queries |

### 5.2 Arquivos de Tipos (Novos + Modificações)

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| **`src/types/franchise.ts`** | ➕ CRIAR | User, Franchise, FranchiseMember, Permission, Invitation |
| **`src/types/store.ts`** | 🔄 MODIFICAR | Adicionar `franchiseId` em Store, criar StoreDispenser |
| **`src/types/sales.ts`** | 🔄 MODIFICAR | Adicionar `operatorId`, `operatorName` |

### 5.3 Arquivos de Serviços (Novos + Modificações)

| Arquivo | Ação | Descrição | Complexidade |
|---------|------|-----------|--------------|
| **`src/services/authService.ts`** | ➕ CRIAR | Login/logout Firebase, PIN fallback | 🟡 Média |
| **`src/services/userService.ts`** | ➕ CRIAR | CRUD de usuários, membership | 🟡 Média |
| **`src/services/franchiseService.ts`** | ➕ CRIAR | CRUD de franquias (seed inicial) | 🟢 Baixa |
| **`src/services/dispenserService.ts`** | ➕ CRIAR | CRUD de dispensers/torneiras | 🟢 Baixa |
| **`src/services/storeService.ts`** | 🔄 MODIFICAR | Usar pathResolver, adicionar franchiseId | 🟡 Média |
| **`src/services/salesService.ts`** | 🔄 MODIFICAR | Adicionar operatorId nas vendas | 🟢 Baixa |

### 5.4 Arquivos de Contexto (Novos)

| Arquivo | Descrição | Complexidade |
|---------|-----------|--------------|
| **`src/context/FranchiseContext.tsx`** | Estado da franquia atual, membership, permissions | 🟡 Média |
| **`src/context/PermissionContext.tsx`** | Verificação de permissões, hook usePermissions | 🟡 Média |

### 5.5 Arquivos de Hooks (Novos + Modificações)

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| **`src/hooks/useAuth.ts`** | ➕ CRIAR | Hook para Firebase Auth + PIN fallback |
| **`src/hooks/usePermissions.ts`** | ➕ CRIAR | Hook para verificar permissões |
| **`src/hooks/useFranchise.ts`** | ➕ CRIAR | Hook para dados da franquia |
| **`src/hooks/useStoreSettings.tsx`** | 🔄 MODIFICAR | Integrar com franchiseId |
| **`src/hooks/useAdminPin.ts`** | 🔄 MODIFICAR | Manter como fallback offline |

### 5.6 Arquivos de Páginas/Componentes (Novos + Modificações)

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| **`src/pages/LoginPage.tsx`** | ➕ CRIAR | Página de login (email/senha + PIN offline) |
| **`src/pages/StoreSelectPage.tsx`** | ➕ CRIAR | Seletor de loja |
| **`src/components/ProtectedRoute.tsx`** | 🔄 MODIFICAR | Usar Firebase Auth + verificar roles |
| **`src/components/AdminSidebar.tsx`** | 🔄 MODIFICAR | Mostrar/ocultar itens por permissão |
| **`src/components/AdminDispensers.tsx`** | ➕ CRIAR | Nova aba para gerenciar torneiras |
| **`src/components/Can.tsx`** | ➕ CRIAR | Componente para verificar permissões |

### 5.7 Arquivos de Infraestrutura (Novos)

| Arquivo | Descrição |
|---------|-----------|
| **`src/lib/pathResolver.ts`** | Resolver de paths com feature flag |
| **`firestore.rules`** | Regras de segurança RBAC |
| **`functions/src/index.ts`** | Cloud Functions (Custom Claims, triggers) |

### 5.8 Resumo de Modificações FASE 1

```
📊 RESUMO FASE 1 - APP KIOSK
────────────────────────────────────────
Arquivos a CRIAR:      15
Arquivos a MODIFICAR:  12
Arquivos a REMOVER:    0 (manter tudo, deprecar se necessário)
────────────────────────────────────────
Complexidade Total:    Média-Alta
Tempo Estimado:        3-4 sprints (6-8 semanas)
────────────────────────────────────────
```

---

## 6. FASE 2 - Arquivos a Criar (Admin App)

### 6.1 Estrutura do Novo Projeto

```
open-kiosk-admin/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   │
│   │   ├── franchise/
│   │   │   ├── FranchiseCard.tsx
│   │   │   ├── FranchiseForm.tsx
│   │   │   └── FranchiseStats.tsx
│   │   │
│   │   ├── stores/
│   │   │   ├── StoreCard.tsx
│   │   │   ├── StoreForm.tsx
│   │   │   ├── StoreList.tsx
│   │   │   └── StoreStats.tsx
│   │   │
│   │   ├── users/
│   │   │   ├── UserTable.tsx
│   │   │   ├── UserForm.tsx
│   │   │   ├── InviteModal.tsx
│   │   │   ├── RoleSelector.tsx
│   │   │   └── PermissionsEditor.tsx
│   │   │
│   │   ├── reports/
│   │   │   ├── SalesReport.tsx
│   │   │   ├── ProductsReport.tsx
│   │   │   ├── OperatorsReport.tsx
│   │   │   └── ReportFilters.tsx
│   │   │
│   │   ├── audit/
│   │   │   ├── AuditLog.tsx
│   │   │   └── AuditFilters.tsx
│   │   │
│   │   ├── billing/
│   │   │   ├── PlanSelector.tsx
│   │   │   ├── BillingHistory.tsx
│   │   │   └── PaymentMethod.tsx
│   │   │
│   │   └── ui/
│   │       └── (shadcn components)
│   │
│   ├── pages/
│   │   ├── public/
│   │   │   ├── LandingPage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── ForgotPasswordPage.tsx
│   │   │   └── InvitePage.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── FranchiseOverview.tsx
│   │   │   └── FranchiseSettings.tsx
│   │   │
│   │   ├── stores/
│   │   │   ├── StoresPage.tsx
│   │   │   ├── StoreDetailPage.tsx
│   │   │   └── StoreCreatePage.tsx
│   │   │
│   │   ├── users/
│   │   │   ├── UsersPage.tsx
│   │   │   ├── UserDetailPage.tsx
│   │   │   └── InvitationsPage.tsx
│   │   │
│   │   ├── reports/
│   │   │   ├── ReportsPage.tsx
│   │   │   └── ExportPage.tsx
│   │   │
│   │   ├── audit/
│   │   │   └── AuditPage.tsx
│   │   │
│   │   └── billing/
│   │       └── BillingPage.tsx
│   │
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   ├── FranchiseContext.tsx
│   │   └── PermissionContext.tsx
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useFranchise.ts
│   │   ├── useStores.ts
│   │   ├── useUsers.ts
│   │   ├── usePermissions.ts
│   │   ├── useReports.ts
│   │   └── useAudit.ts
│   │
│   ├── services/
│   │   ├── authService.ts
│   │   ├── franchiseService.ts
│   │   ├── storeService.ts
│   │   ├── userService.ts
│   │   ├── invitationService.ts
│   │   ├── reportService.ts
│   │   ├── auditService.ts
│   │   └── billingService.ts
│   │
│   ├── types/
│   │   ├── franchise.ts
│   │   ├── store.ts
│   │   ├── user.ts
│   │   ├── reports.ts
│   │   └── audit.ts
│   │
│   └── lib/
│       ├── firebase.ts
│       ├── pathResolver.ts
│       └── utils.ts
│
├── functions/                     # Cloud Functions compartilhado
│   └── src/
│       ├── auth/
│       │   ├── onUserCreate.ts
│       │   └── setCustomClaims.ts
│       ├── franchises/
│       │   ├── onFranchiseCreate.ts
│       │   └── validateLimits.ts
│       ├── invitations/
│       │   ├── sendInvite.ts
│       │   └── acceptInvite.ts
│       └── index.ts
│
├── firestore.rules                # Regras RBAC completas
├── firebase.json
├── package.json
└── vite.config.ts
```

### 6.2 Resumo de Arquivos FASE 2

```
📊 RESUMO FASE 2 - APP ADMIN
────────────────────────────────────────
Páginas:               15
Componentes:           30+
Hooks:                 10
Serviços:              8
Cloud Functions:       6
────────────────────────────────────────
Complexidade Total:    Alta
Tempo Estimado:        4-6 sprints (8-12 semanas)
────────────────────────────────────────
```

---

## 7. Fluxo de Autenticação

### 7.1 Novo Fluxo de Autenticação (Fase 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NOVO FLUXO DE AUTENTICAÇÃO                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         CENÁRIO ONLINE                                  │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                         │ │
│  │  1. Usuário acessa /login                                               │ │
│  │     └─ Exibe formulário email/senha                                     │ │
│  │                                                                         │ │
│  │  2. Firebase Auth: signInWithEmailAndPassword()                         │ │
│  │     └─ Valida credenciais                                               │ │
│  │     └─ Retorna user + custom claims (franchiseId, role)                │ │
│  │                                                                         │ │
│  │  3. onAuthStateChanged dispara                                          │ │
│  │     └─ AuthContext carrega user data de users/{uid}                    │ │
│  │     └─ FranchiseContext carrega membership                              │ │
│  │                                                                         │ │
│  │  4. Redireciona baseado em storeAccess                                  │ │
│  │     └─ Se storeAccess.length > 1 → /store-select                       │ │
│  │     └─ Se storeAccess.length = 1 → Seleciona automaticamente           │ │
│  │                                                                         │ │
│  │  5. Redireciona baseado em role                                         │ │
│  │     └─ operator → /shop                                                 │ │
│  │     └─ technician → /admin?tab=esp32                                   │ │
│  │     └─ manager/admin/owner → /admin                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         CENÁRIO OFFLINE (Fallback)                      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                         │ │
│  │  1. Usuário acessa /login sem internet                                  │ │
│  │     └─ Detecta navigator.onLine = false                                │ │
│  │     └─ Exibe: "Modo Offline - Use PIN de emergência"                   │ │
│  │                                                                         │ │
│  │  2. Usuário digita PIN                                                  │ │
│  │     └─ Valida com hash salvo em localStorage                           │ │
│  │     └─ Hash gerado previamente via VITE_OFFLINE_PIN_HASH               │ │
│  │                                                                         │ │
│  │  3. Login offline bem-sucedido                                          │ │
│  │     └─ Carrega última loja do localStorage                             │ │
│  │     └─ Carrega role padrão (manager) para acesso offline              │ │
│  │     └─ Sincroniza quando internet retornar                             │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Componentes Envolvidos

```typescript
// src/services/authService.ts

export const authService = {
  // Login online com Firebase
  async loginWithEmail(email: string, password: string): Promise<AuthResult> {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user = credential.user;
    
    // Obter claims customizados
    const token = await user.getIdTokenResult();
    const claims = token.claims as CustomClaims;
    
    // Salvar dados para uso offline
    await this.cacheUserForOffline(user, claims);
    
    return { user, claims };
  },
  
  // Login offline com PIN (fallback)
  async loginWithPin(pin: string): Promise<AuthResult> {
    const storedHash = import.meta.env.VITE_OFFLINE_PIN_HASH;
    const inputHash = await hashPin(pin);
    
    if (inputHash !== storedHash) {
      throw new AuthError('PIN inválido');
    }
    
    // Carregar dados cached
    const cachedUser = await this.getCachedUser();
    if (!cachedUser) {
      throw new AuthError('Nenhum usuário em cache para modo offline');
    }
    
    return { user: cachedUser, offline: true };
  },
  
  // Detectar se está online
  isOnline(): boolean {
    return navigator.onLine;
  }
};
```

---

## 8. Fluxo de Login no Kiosk

### 8.1 Fluxo Visual

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE LOGIN NO KIOSK                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │                         🏪 LOGIN                                     │   │
│   │                                                                      │   │
│   │   ┌─────────────────────────────────────────────────────────────┐   │   │
│   │   │                                                              │   │   │
│   │   │  📧 Email: [_____________________________]                  │   │   │
│   │   │                                                              │   │   │
│   │   │  🔒 Senha: [_____________________________]                  │   │   │
│   │   │                                                              │   │   │
│   │   │           [ Entrar ]                                         │   │   │
│   │   │                                                              │   │   │
│   │   │  ─────────────────────────────────────────────────────────  │   │   │
│   │   │                                                              │   │   │
│   │   │  📴 Sem internet?                                           │   │   │
│   │   │  [ Usar PIN de Emergência ]                                 │   │   │
│   │   │                                                              │   │   │
│   │   └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│                                 │                                            │
│                                 ▼                                            │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │                    🏪 SELECIONAR LOJA                               │   │
│   │                    (se usuário tem acesso a > 1 loja)               │   │
│   │                                                                      │   │
│   │   ┌─────────────────────────────────────────────────────────────┐   │   │
│   │   │  🏪  Loja Centro                                            │   │   │
│   │   │      Av. Paulista, 1000                                      │   │   │
│   │   │      🟢 Online                                               │   │   │
│   │   └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   │   ┌─────────────────────────────────────────────────────────────┐   │   │
│   │   │  🏪  Loja Shopping                                          │   │   │
│   │   │      Shopping Morumbi, Piso 3                                │   │   │
│   │   │      🟢 Online                                               │   │   │
│   │   └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   │                        [ Sair ]                                      │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│                                 │                                            │
│                                 ▼                                            │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │  Redireciona baseado no role:                                       │   │
│   │                                                                      │   │
│   │  • OPERATOR     → /shop                                             │   │
│   │  • TECHNICIAN   → /admin?tab=esp32                                  │   │
│   │  • MANAGER+     → /admin                                            │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Mantendo o Gesto Secreto

O gesto de 5 cliques rápidos será **mantido** para:
- Acesso rápido ao admin quando já logado como operator
- Validar permissões do usuário logado (não mais PIN global)

```typescript
// Comportamento atualizado do AdminSecretAccess

if (gestoDetectado) {
  const { user, role } = useAuth();
  
  if (!user) {
    // Não logado - mostrar tela de login
    navigate('/login');
  } else if (role === 'operator') {
    // Operator tentando acessar admin
    toast.error('Você não tem permissão para acessar o painel administrativo');
  } else {
    // Manager+ - permitir acesso direto
    navigate('/admin');
  }
}
```

---

## 9. Fluxo de Permissões

### 9.1 Custom Claims do Firebase

```typescript
// Estrutura de Custom Claims

interface CustomClaims {
  franchiseId: string;      // ID da franquia principal
  role: UserRole;           // 'owner' | 'admin' | 'manager' | 'operator' | 'technician'
  storeAccess: string[];    // ['store1', 'store2'] ou ['*'] para todas
}
```

### 9.2 Firestore Security Rules

```javascript
// firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ════════════════════════════════════════════════════════════════
    // FUNÇÕES AUXILIARES
    // ════════════════════════════════════════════════════════════════
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function getUserRole(franchiseId) {
      return get(/databases/$(database)/documents/franchises/$(franchiseId)/members/$(request.auth.uid)).data.role;
    }
    
    function hasRole(franchiseId, roles) {
      return getUserRole(franchiseId) in roles;
    }
    
    function hasStoreAccess(franchiseId, storeId) {
      let membership = get(/databases/$(database)/documents/franchises/$(franchiseId)/members/$(request.auth.uid)).data;
      return '*' in membership.storeAccess || storeId in membership.storeAccess;
    }
    
    // ════════════════════════════════════════════════════════════════
    // USERS COLLECTION
    // ════════════════════════════════════════════════════════════════
    
    match /users/{userId} {
      allow read: if isAuthenticated() && request.auth.uid == userId;
      allow create: if isAuthenticated() && request.auth.uid == userId;
      allow update: if isAuthenticated() && request.auth.uid == userId;
      allow delete: if false;
    }
    
    // ════════════════════════════════════════════════════════════════
    // FRANCHISES COLLECTION
    // ════════════════════════════════════════════════════════════════
    
    match /franchises/{franchiseId} {
      allow read: if isAuthenticated() 
                  && exists(/databases/$(database)/documents/franchises/$(franchiseId)/members/$(request.auth.uid));
      allow create: if isAuthenticated();
      allow update: if isAuthenticated() && hasRole(franchiseId, ['owner', 'admin']);
      allow delete: if false;
      
      // Members subcollection
      match /members/{memberId} {
        allow read: if isAuthenticated() 
                    && exists(/databases/$(database)/documents/franchises/$(franchiseId)/members/$(request.auth.uid));
        allow write: if isAuthenticated() && hasRole(franchiseId, ['owner', 'admin']);
      }
      
      // Stores subcollection
      match /stores/{storeId} {
        allow read: if isAuthenticated() && hasStoreAccess(franchiseId, storeId);
        allow create: if isAuthenticated() && hasRole(franchiseId, ['owner', 'admin']);
        allow update: if isAuthenticated() && hasStoreAccess(franchiseId, storeId)
                      && hasRole(franchiseId, ['owner', 'admin', 'manager']);
        allow delete: if isAuthenticated() && hasRole(franchiseId, ['owner']);
        
        // Products
        match /products/{productId} {
          allow read: if isAuthenticated() && hasStoreAccess(franchiseId, storeId);
          allow write: if isAuthenticated() && hasStoreAccess(franchiseId, storeId)
                       && hasRole(franchiseId, ['owner', 'admin', 'manager']);
        }
        
        // Sales
        match /sales/{saleId} {
          allow read: if isAuthenticated() && hasStoreAccess(franchiseId, storeId);
          allow create: if isAuthenticated() && hasStoreAccess(franchiseId, storeId);
          allow update, delete: if false; // Vendas são imutáveis
        }
        
        // Settings
        match /settings/{docId} {
          allow read: if isAuthenticated() && hasStoreAccess(franchiseId, storeId);
          allow write: if isAuthenticated() && hasStoreAccess(franchiseId, storeId)
                       && hasRole(franchiseId, ['owner', 'admin', 'manager']);
        }
        
        // Dispensers
        match /dispensers/{dispenserId} {
          allow read: if isAuthenticated() && hasStoreAccess(franchiseId, storeId);
          allow write: if isAuthenticated() && hasStoreAccess(franchiseId, storeId)
                       && hasRole(franchiseId, ['owner', 'admin', 'manager', 'technician']);
        }
      }
    }
    
    // ════════════════════════════════════════════════════════════════
    // AUDIT LOGS (Append-Only)
    // ════════════════════════════════════════════════════════════════
    
    match /audit_logs/{logId} {
      allow read: if isAuthenticated() && hasRole(resource.data.franchiseId, ['owner', 'admin']);
      allow create: if isAuthenticated();
      allow update, delete: if false;
    }
  }
}
```

### 9.3 Hook de Permissões

```typescript
// src/hooks/usePermissions.ts

export function usePermissions() {
  const { membership } = useFranchise();
  
  const can = useCallback((permission: Permission): boolean => {
    if (!membership) return false;
    
    // Owner pode tudo
    if (membership.role === 'owner') return true;
    
    // Admin pode quase tudo (exceto billing)
    if (membership.role === 'admin') {
      return permission !== 'franchise:billing';
    }
    
    // Verificar permissões específicas
    return ROLE_PERMISSIONS[membership.role].includes(permission);
  }, [membership]);
  
  const hasStoreAccess = useCallback((storeId: string): boolean => {
    if (!membership) return false;
    return membership.storeAccess.includes('*') || membership.storeAccess.includes(storeId);
  }, [membership]);
  
  return { can, hasStoreAccess, role: membership?.role };
}
```

### 9.4 Componente Can

```tsx
// src/components/Can.tsx

interface CanProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function Can({ permission, children, fallback = null }: CanProps) {
  const { can } = usePermissions();
  
  if (can(permission)) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
}

// Uso:
<Can permission="products:create">
  <Button onClick={addProduct}>Adicionar Produto</Button>
</Can>
```

---

## 10. Roadmap Técnico por Etapas

### 10.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ROADMAP DE IMPLEMENTAÇÃO                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════════│
│                            FASE 1 - APP KIOSK                                │
│  ═══════════════════════════════════════════════════════════════════════════│
│                                                                              │
│  ETAPA 1.0: INFRAESTRUTURA (1 semana)                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar firestore.rules com regras básicas                                 │
│  □ Habilitar Firebase Auth (email/senha) no console                         │
│  □ Criar pathResolver.ts com feature flag                                   │
│  □ Criar estrutura de Cloud Functions                                       │
│  □ Configurar Firebase Emulators para desenvolvimento                       │
│                                                                              │
│  ETAPA 1.1: TIPOS E INTERFACES (3 dias)                                      │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar src/types/franchise.ts                                              │
│  □ Modificar src/types/store.ts (adicionar franchiseId)                     │
│  □ Modificar src/types/sales.ts (adicionar operatorId)                      │
│  □ Criar tipos para Dispenser                                                │
│                                                                              │
│  ETAPA 1.2: SERVIÇOS DE AUTENTICAÇÃO (1 semana)                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar src/services/authService.ts                                         │
│  □ Criar src/services/userService.ts                                         │
│  □ Criar src/services/franchiseService.ts                                    │
│  □ Modificar src/lib/firebase.ts para usar pathResolver                     │
│  □ Criar Cloud Function: setCustomClaims                                    │
│                                                                              │
│  ETAPA 1.3: CONTEXTOS (1 semana)                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Reescrever src/context/AuthContext.tsx para Firebase Auth                │
│  □ Criar src/context/FranchiseContext.tsx                                    │
│  □ Criar src/context/PermissionContext.tsx                                   │
│  □ Modificar src/context/StoreContext.tsx (adicionar franchiseId)           │
│                                                                              │
│  ETAPA 1.4: PÁGINAS E ROTAS (1 semana)                                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar src/pages/LoginPage.tsx                                             │
│  □ Criar src/pages/StoreSelectPage.tsx                                       │
│  □ Modificar src/components/ProtectedRoute.tsx                               │
│  □ Modificar src/App.tsx (adicionar novas rotas)                            │
│  □ Criar src/hooks/useAuth.ts                                                │
│  □ Criar src/hooks/usePermissions.ts                                         │
│                                                                              │
│  ETAPA 1.5: COMPONENTES UI (1 semana)                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar src/components/Can.tsx                                              │
│  □ Modificar src/components/AdminSidebar.tsx (verificar permissões)         │
│  □ Modificar src/components/AdminSecretAccess.tsx (validar role)            │
│  □ Criar src/components/AdminDispensers.tsx                                  │
│  □ Criar src/services/dispenserService.ts                                    │
│                                                                              │
│  ETAPA 1.6: INTEGRAÇÃO E TESTES (1 semana)                                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Modificar hooks existentes para usar novo auth                            │
│  □ Modificar serviços para usar pathResolver                                 │
│  □ Criar usuários seed manualmente no Firebase                              │
│  □ Testar fluxo completo de login → PDV                                     │
│  □ Testar fallback offline com PIN                                          │
│  □ Testar isolamento de dados por franchise                                 │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════════│
│                            FASE 2 - APP ADMIN                                │
│  ═══════════════════════════════════════════════════════════════════════════│
│                                                                              │
│  ETAPA 2.0: SETUP DO PROJETO (3 dias)                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar novo projeto Vite: open-kiosk-admin                                │
│  □ Configurar Tailwind CSS + shadcn/ui                                       │
│  □ Copiar tipos compartilhados                                               │
│  □ Configurar Firebase (mesmo projeto)                                      │
│                                                                              │
│  ETAPA 2.1: AUTENTICAÇÃO E REGISTRO (1 semana)                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar LandingPage, LoginPage, RegisterPage                               │
│  □ Criar ForgotPasswordPage                                                  │
│  □ Criar fluxo de criação de franquia                                       │
│  □ Criar InvitePage para aceitar convites                                   │
│                                                                              │
│  ETAPA 2.2: DASHBOARD E NAVEGAÇÃO (1 semana)                                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar Layout (Sidebar + Header)                                          │
│  □ Criar FranchiseSelector                                                   │
│  □ Criar DashboardPage com KPIs consolidados                                │
│  □ Criar FranchiseOverview                                                   │
│                                                                              │
│  ETAPA 2.3: GESTÃO DE LOJAS (1 semana)                                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar StoresPage (lista de lojas)                                        │
│  □ Criar StoreDetailPage                                                     │
│  □ Criar StoreCreatePage                                                     │
│  □ Criar StoreForm                                                           │
│                                                                              │
│  ETAPA 2.4: GESTÃO DE USUÁRIOS (1 semana)                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar UsersPage (lista de usuários)                                      │
│  □ Criar UserDetailPage                                                      │
│  □ Criar InviteModal                                                         │
│  □ Criar PermissionsEditor                                                   │
│  □ Criar Cloud Function: sendInvite, acceptInvite                           │
│                                                                              │
│  ETAPA 2.5: RELATÓRIOS (1 semana)                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar ReportsPage                                                         │
│  □ Criar SalesReport (agregação por período/loja)                           │
│  □ Criar ProductsReport                                                      │
│  □ Criar ExportPage (CSV/PDF)                                               │
│                                                                              │
│  ETAPA 2.6: AUDITORIA (3 dias)                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Criar AuditPage                                                           │
│  □ Criar AuditLog component                                                  │
│  □ Criar AuditFilters                                                        │
│                                                                              │
│  ETAPA 2.7: BILLING (Opcional - 1 semana)                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  □ Integrar Stripe                                                           │
│  □ Criar BillingPage                                                         │
│  □ Criar PlanSelector                                                        │
│  □ Implementar limites por plano                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Cronograma Resumido

| Fase | Etapa | Duração | Dependências |
|------|-------|---------|--------------|
| **1** | 1.0 Infraestrutura | 1 semana | - |
| **1** | 1.1 Tipos | 3 dias | 1.0 |
| **1** | 1.2 Serviços Auth | 1 semana | 1.1 |
| **1** | 1.3 Contextos | 1 semana | 1.2 |
| **1** | 1.4 Páginas/Rotas | 1 semana | 1.3 |
| **1** | 1.5 Componentes UI | 1 semana | 1.4 |
| **1** | 1.6 Integração/Testes | 1 semana | 1.5 |
| | **SUBTOTAL FASE 1** | **~6-7 semanas** | |
| **2** | 2.0 Setup Projeto | 3 dias | 1.6 |
| **2** | 2.1 Auth/Registro | 1 semana | 2.0 |
| **2** | 2.2 Dashboard | 1 semana | 2.1 |
| **2** | 2.3 Gestão Lojas | 1 semana | 2.2 |
| **2** | 2.4 Gestão Usuários | 1 semana | 2.3 |
| **2** | 2.5 Relatórios | 1 semana | 2.3 |
| **2** | 2.6 Auditoria | 3 dias | 2.4 |
| **2** | 2.7 Billing (Opcional) | 1 semana | 2.4 |
| | **SUBTOTAL FASE 2** | **~6-7 semanas** | |
| | **TOTAL GERAL** | **~12-14 semanas** | |

---

## 11. Estimativa de Complexidade

### 11.1 Por Área Técnica

| Área | Complexidade | Justificativa | Risco |
|------|--------------|---------------|-------|
| **Firebase Auth** | 🟡 Média | Nova implementação, bem documentada | Baixo |
| **Custom Claims** | 🟡 Média | Requer Cloud Functions | Médio |
| **Path Resolver** | 🟢 Baixa | Abstração simples | Baixo |
| **Firestore Rules** | 🔴 Alta | RBAC complexo, muitos casos de borda | Alto |
| **Multi-tenancy** | 🟡 Média | Estrutura já existe, adicionar camada | Médio |
| **Offline PIN** | 🟢 Baixa | Adaptar código existente | Baixo |
| **UI Permissões** | 🟢 Baixa | Componente Can + hooks | Baixo |
| **Dispensers** | 🟢 Baixa | CRUD simples | Baixo |
| **App Admin (Novo)** | 🔴 Alta | Projeto novo do zero | Médio |

### 11.2 Por Tipo de Trabalho

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    DISTRIBUIÇÃO DE ESFORÇO                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Backend (Firebase/Functions)  ████████████████░░░░░░░░░░  35%             │
│  Lógica de Negócio (Hooks)     ████████████░░░░░░░░░░░░░░  25%             │
│  UI/Componentes                ████████░░░░░░░░░░░░░░░░░░  20%             │
│  Testes/Integração             ██████░░░░░░░░░░░░░░░░░░░░  15%             │
│  Documentação                  ██░░░░░░░░░░░░░░░░░░░░░░░░  5%              │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Métricas Estimadas

| Métrica | FASE 1 | FASE 2 | Total |
|---------|--------|--------|-------|
| Arquivos a criar | 15 | 50+ | 65+ |
| Arquivos a modificar | 12 | 5 | 17 |
| Linhas de código (estimado) | ~3.000 | ~8.000 | ~11.000 |
| Cloud Functions | 3 | 5 | 8 |
| Páginas novas | 2 | 12 | 14 |
| Componentes novos | 5 | 30+ | 35+ |

---

## 12. Riscos Técnicos

### 12.1 Matriz de Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **Firestore Rules complexas causam bugs de permissão** | 🟡 Média | 🔴 Alto | Testes extensivos com Firebase Emulator, documentação de casos de borda |
| **Offline mode não sincroniza corretamente** | 🟡 Média | 🟡 Médio | Manter PIN como fallback, queue de sync robusta |
| **Custom Claims não propagam rápido** | 🟢 Baixa | 🟡 Médio | Forçar refresh do token, cache local |
| **Performance com muitas lojas** | 🟢 Baixa | 🟡 Médio | Paginação, queries otimizadas, índices |
| **Migração de dados existentes** | 🔴 N/A | 🔴 N/A | Não há migração (greenfield) |
| **Conflito de versões (Kiosk vs Admin)** | 🟢 Baixa | 🟡 Médio | Tipos compartilhados, versionamento semântico |
| **ESP32 não funciona com novo modelo** | 🟢 Baixa | 🟢 Baixo | Hardware é independente da estrutura de franquia |

### 12.2 Dependências Externas

| Dependência | Risco | Mitigação |
|-------------|-------|-----------|
| **Firebase Auth** | Baixo | Serviço estável, bem documentado |
| **Cloud Functions** | Médio | Requer plano Blaze (pay-as-you-go) |
| **Mercado Pago API** | Baixo | Já integrado e funcionando |
| **Stripe (Billing)** | Médio | Opcional, pode ser adiado |

### 12.3 Pontos de Atenção

1. **Teste Exaustivo de Firestore Rules**
   - Usar Firebase Emulator Suite
   - Criar testes unitários para cada regra
   - Documentar todos os cenários de acesso

2. **Garantir Funcionamento Offline**
   - Testar com airplane mode
   - Verificar sincronização ao reconectar
   - PIN deve funcionar sem internet

3. **Performance com Múltiplas Lojas**
   - Não carregar todas as lojas de uma vez
   - Usar paginação e lazy loading
   - Criar índices compostos no Firestore

4. **Compatibilidade com App Atual**
   - Feature flag para ativar modo franquia gradualmente
   - Não quebrar funcionalidades existentes
   - Manter caminho de rollback

---

## 📝 Notas Finais

### Próximos Passos Imediatos

1. **Revisar este documento** com a equipe
2. **Criar issues/tasks** no sistema de gerenciamento de projetos
3. **Configurar ambiente de desenvolvimento** com Firebase Emulators
4. **Iniciar ETAPA 1.0** (Infraestrutura)

### Documentos Relacionados

- `docs/ESP32-INTEGRATION-v2.md` - Documentação do hardware
- `docs/LED-QUICK-REFERENCE.txt` - Referência rápida de LEDs
- `firmware/ManualCircuito.md` - Manual do circuito ESP32

---

**Documento gerado em:** 18 de Janeiro de 2026  
**Última atualização:** 18 de Janeiro de 2026  
**Versão:** 1.0
