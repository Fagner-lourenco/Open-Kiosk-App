# Open Kiosk App - Mapa de Arquitetura Completo

**Status:** Atualizado 2025-02-27  
**Linguagem:** Português (PT-BR)  
**Versão da App:** 1.1.0

---

## 1. VISÃO GERAL - COMPONENTES PRINCIPAIS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OPEN KIOSK - STACK COMPLETO                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │  KIOSK WEB APP   │  │   ADMIN WEB APP  │  │  CLOUD FUNCTIONS (FN)   │  │
│  │   (src/)         │  │  (admin/src/)    │  │  (functions/src/)       │  │
│  │                  │  │                  │  │                         │  │
│  │ • React 18       │  │ • React 18       │  │ • Node.js/Express       │  │
│  │ • Vite           │  │ • TypeScript     │  │ • Firestore Triggers    │  │
│  │ • TailwindCSS    │  │ • TailwindCSS    │  │ • Webhooks/Crons        │  │
│  │ • TypeScript     │  │ • React Query    │  │ • PagBank/Stripe API    │  │
│  │                  │  │                  │  │                         │  │
│  │ Porta: 8080      │  │ Porta: 5174      │  │ Deploy: Firebase        │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────────────┘  │
│         │                       │                       │                  │
│         │  Firebase SDK         │                       │                  │
│         └─────────────┬─────────┴───────────────────────┘                  │
│                       │                                                    │
│              ┌────────▼─────────┐                                          │
│              │  FIREBASE (Backend)                                         │
│              │  ─────────────────                                          │
│              │ • Firestore DB                                              │
│              │ • Auth (Google)                                             │
│              │ • Storage (media)                                           │
│              │ • Hosting                                                   │
│              └────────┬─────────┘                                          │
│                       │                                                    │
│     ┌─────────────────┼─────────────────┐                                  │
│     │                 │                 │                                  │
│     ▼                 ▼                 ▼                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐                         │
│  │  ANDROID │  │  ESP32       │  │ PAYMENT      │                         │
│  │ NATIVE   │  │ FIRMWARE     │  │ TERMINALS    │                         │
│  │          │  │              │  │              │                         │
│  │Capacitor │  │BLE/USB/WiFi  │  │• PlugPag     │                         │
│  │ Plugin   │  │Communication │  │• MercadoPago │                         │
│  │          │  │              │  │• PIX Qr Code │                         │
│  │ • BLE    │  │ • Torneiras  │  │              │                         │
│  │ • USB    │  │ • Bombas     │  │ PagBank API  │                         │
│  │ • PlugPag│  │ • Sensores   │  │ Stripe API   │                         │
│  │          │  │              │  │              │                         │
│  └──────────┘  └──────────────┘  └──────────────┘                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. ESTRUTURA DO PROJETO

```
D:\Open-Kiosk-App/
├── src/                           # Kiosk Web App (React)
│   ├── pages/                     # Rotas principais
│   │   ├── Shop.tsx              # Loja/vitrine + carrinho
│   │   ├── Checkout.tsx          # Checkout + pagamento
│   │   ├── LoginPage.tsx         # Autenticação
│   │   ├── StoreSelectPage.tsx   # Seleção de loja
│   │   ├── Admin.tsx             # Painel local do quiosque
│   │   ├── AcceptInvitePage.tsx  # Aceitar convite de usuário
│   │   └── Index.tsx             # Landing page
│   ├── services/                 # Serviços de negócio (30+ files)
│   │   ├── firebase.ts           # Firebase Auth + Firestore API
│   │   ├── plugpagPaymentService.ts      # Terminal PlugPag (PagBank)
│   │   ├── paymentService.ts             # Orquestração pagamentos
│   │   ├── esp32CommunicationService.ts  # Hardware ESP32 (BLE/USB/WiFi)
│   │   ├── esp32SerialService.ts         # Protocolo serial ESP32
│   │   ├── salesService.ts               # Pedidos + persistência
│   │   ├── dispenserService.ts           # Lógica de dispensação
│   │   ├── servingSessionService.ts      # Sessões de consumo (ERP)
│   │   ├── kioskBootstrapService.ts      # Inicialização do quiosque
│   │   ├── kioskModeService.ts           # Lock Task Android
│   │   ├── deviceHeartbeatService.ts     # GPS + Device ID
│   │   ├── hardwareStatusService.ts      # Status hardware
│   │   ├── terminalRelayService.ts       # Relay para operações remotas
│   │   ├── cameraStreamService.ts        # Stream de câmera remota
│   │   ├── merchandiseService.ts         # Operações de merchandising
│   │   ├── userService.ts                # Perfil + permissões
│   │   ├── cacheService.ts               # IndexedDB/localStorage
│   │   ├── productCacheService.ts        # Cache de produtos
│   │   ├── videoCacheService.ts          # Cache de vídeos
│   │   ├── nativeWebViewCacheService.ts  # Cache nativo Android
│   │   ├── dispenseRecoveryService.ts    # Recuperação de falhas
│   │   ├── syncService.ts                # Sincronização dados offline
│   │   ├── systemLogService.ts           # Logs de sistema
│   │   └── ... (mais 5+ utilitários)
│   ├── context/                  # Estado global React
│   │   ├── AuthContext.tsx       # Autenticação + usuário
│   │   ├── ESP32Context.tsx      # Estado hardware ESP32
│   │   ├── PaymentGatewayContext.tsx     # Config de pagamentos
│   │   ├── StoreContext.tsx      # Loja atual + config
│   │   ├── FranchiseContext.tsx  # Franquia atual
│   │   └── PermissionContext.tsx # Permissões do usuário
│   ├── hooks/                    # React Hooks customizados
│   │   ├── useESP32.ts           # Acesso ao contexto ESP32
│   │   ├── useAuth.ts            # Acesso ao contexto Auth
│   │   ├── useFirebaseProducts.ts        # Carrega produtos do Firestore
│   │   ├── useStoreSettings.ts           # Config de loja
│   │   ├── usePlugPagAutoConnect.ts      # Auto-conexão terminal
│   │   ├── useKioskIdle.ts               # Idle timer + attract
│   │   └── ... (mais 15+ hooks)
│   ├── components/               # Componentes React (100+ files)
│   │   ├── Cart.tsx              # Carrinho de compras
│   │   ├── Checkout.tsx          # UI de checkout
│   │   ├── PaymentFlow.tsx       # Fluxo de pagamento
│   │   ├── DrinkCard.tsx         # Card de produto bebida
│   │   ├── DrinkQuickCheckoutModal.tsx  # Quick checkout modal
│   │   ├── DrinkPickupScreen.tsx        # Tela de retirada
│   │   ├── AttractScreen.tsx            # Tela ociosa
│   │   ├── ESP32StatusBar.tsx           # Status do hardware
│   │   ├── PaymentTerminalStatus.tsx    # Status do terminal
│   │   ├── OnScreenKeyboard.tsx         # Teclado touchscreen
│   │   ├── VoiceSearchButton.tsx        # Busca por voz
│   │   ├── CameraActiveIndicator.tsx    # Indicador câmera
│   │   ├── AdminSecretAccess.tsx        # Acesso admin local
│   │   ├── FranchiseGuard.tsx           # Guard de franquia
│   │   ├── TapSettingsSync.tsx          # Sincronização torneiras
│   │   ├── PWAUpdatePrompt.tsx          # Atualização PWA
│   │   └── ui/                   # Componentes UI (Radix + shadcn)
│   ├── config/                   # Configurações globais
│   │   ├── paymentGateway.ts     # Enum/tipos de gateway
│   │   └── ... (mais configs)
│   ├── types/                    # TypeScript types/interfaces
│   │   ├── product.ts            # Produto, CartItem
│   │   ├── payments.ts           # Payment, PaymentResult
│   │   ├── store.ts              # Store, StoreSettings
│   │   ├── esp32ContextTypes.ts  # Tipos ESP32
│   │   ├── franchise.ts          # Franchise, Member
│   │   └── ... (mais tipos)
│   ├── lib/                      # Utilitários
│   │   ├── pathResolver.ts       # Resolve caminhos Firestore por tenant
│   │   └── ... (mais utilitários)
│   ├── i18n/                     # Internacionalização
│   │   └── languages/            # PT-BR, EN, ES
│   ├── utils/                    # Funções utilitárias puras
│   │   ├── productUtils.ts       # Utilitários de produto
│   │   ├── formatters.ts         # Formatação moeda/data
│   │   └── ... (mais utilitários)
│   ├── plugins/                  # Plugins customizados
│   │   └── plugpagTerminal.ts    # Type definitions do PlugPag
│   ├── main.tsx                  # Entry point React
│   ├── App.tsx                   # Root component
│   └── vite.config.ts            # Config Vite
│
├── admin/src/                     # Admin Web App (React)
│   ├── pages/                    # Páginas de admin
│   │   ├── dashboard/            # Dashboard overview
│   │   ├── stores/               # Gerenciamento de lojas
│   │   ├── team/                 # Gerenciamento de equipe
│   │   ├── audit/                # Auditoria/logs
│   │   ├── billing/              # Faturamento
│   │   ├── reports/              # Relatórios
│   │   ├── ranking/              # Ranking gamificação
│   │   ├── settings/             # Configurações
│   │   ├── profile/              # Perfil de usuário
│   │   ├── users/                # Gerenciamento de usuários
│   │   ├── superadmin/           # Superadmin (master config)
│   │   ├── forecast/             # Previsão de demanda
│   │   └── public/               # Públicos (sem auth)
│   ├── services/                 # Serviços
│   │   ├── firebase.ts           # Firebase Admin SDK patterns
│   │   ├── auditService.ts       # Log de auditoria
│   │   ├── paymentService.ts     # Detalhes pagamentos
│   │   ├── analyticsService.ts   # Métricas/analytics
│   │   └── ... (mais serviços)
│   ├── context/                  # Estado global
│   ├── hooks/                    # Hooks customizados
│   ├── components/               # Componentes reutilizáveis
│   ├── types/                    # TypeScript types
│   ├── lib/                      # Utilitários
│   ├── i18n/                     # Internacionalização
│   ├── utils/                    # Funções puras
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Root
│   └── vite.config.ts            # Config
│
├── functions/src/                 # Cloud Functions (Backend)
│   ├── auth/                     # Auth & Claims
│   │   ├── onCreate.ts           # Trigger: novo usuário
│   │   ├── setCustomClaims.ts    # Callable: set claims
│   │   └── claims.ts             # Lógica claims (admin/member roles)
│   ├── invitations/              # Convites de usuários
│   │   ├── sendEmail.ts          # Envio email
│   │   └── accept.ts             # Aceitar convite
│   ├── payments/                 # Processamento pagamentos
│   │   ├── createPayment.ts      # Callable: criar pagamento
│   │   ├── pagbankWebhook.ts     # Webhook PagBank
│   │   ├── mercadopagoWebhook.ts # Webhook MercadoPago
│   │   ├── syncPendingPayments.ts        # Sync status pendente
│   │   ├── onPaymentUpdated.ts           # Trigger: pagamento atualizado
│   │   └── types.ts              # Tipos compartilhados
│   ├── erp/                      # ERP vertical (torneiras/barris)
│   │   ├── onServingSessionCreated.ts    # Trigger: sessão criada
│   │   ├── onWastageEventCreated.ts      # Trigger: desperdício
│   │   ├── aggregateOperationalDaily.ts  # Agrega métricas diárias
│   │   ├── checkKegLevels.ts             # Monitora nível barril
│   │   ├── checkMaintenanceOverdue.ts    # Manutenção vencida
│   │   ├── resetTapDailyCounters.ts      # Reset contadores
│   │   └── ... (mais funções ERP)
│   ├── analytics/                # Analytics & métricas
│   │   ├── aggregateDailySales.ts        # Agrega vendas diárias
│   │   ├── getMetricsAdmin.ts            # Callable: métricas admin
│   │   ├── aggOrders.ts          # Trigger: agregação pedidos
│   │   └── cleanupDedupCollections.ts    # Limpeza dedup
│   ├── finance/                  # Ledger financeiro
│   │   ├── onOrderPaidLedger.ts          # Registra vendas no ledger
│   │   ├── onWastageEventLedger.ts       # Registra desperdício
│   │   └── onKegStatusChangeLedger.ts    # Registra custo barril
│   ├── ranking/                  # Gamificação/Ranking
│   │   ├── rankingFunctions.ts           # Triggers ranking
│   │   ├── toggleEventMode.ts            # Callable: ativa/desativa modo evento
│   │   ├── recalculate30minNow.ts        # Callable: recalcula ranking
│   │   └── types.ts
│   ├── billing/                  # Stripe integration
│   │   ├── stripeWebhook.ts      # Webhook Stripe
│   │   └── createCheckout.ts     # Callable: sessão checkout
│   ├── superadmin/               # Gerenciamento superadmin
│   │   ├── setSuperAdmin.ts      # Prompt: add superadmin
│   │   └── promoteSuperAdminHTTP.ts      # HTTP: promover superadmin
│   ├── notifications/            # FCM Push notifications
│   │   └── sendPushNotification.ts       # Callable: enviar notificação
│   ├── forecast/                 # Previsão de demanda
│   │   ├── predictDemand.ts      # Lógica previsão
│   │   ├── fetchClimate.ts       # Fetch clima OpenWeatherMap
│   │   └── types.ts
│   ├── cleanup/                  # Limpeza de dados
│   │   └── onDeleteStore.ts      # Trigger: deletar loja (cascata)
│   ├── migrations/               # Migrações (DISABLED)
│   │   ├── consolidatePaymentGatewayConfig.ts
│   │   └── unifyStoreSettings.ts
│   ├── middleware/               # Middleware comum
│   │   ├── auth.ts               # Verificar auth token
│   │   ├── claims.ts             # Verificar claims
│   │   └── errorHandler.ts       # Error handling
│   ├── utils/                    # Utilitários
│   │   ├── firestore.ts          # Helpers Firestore
│   │   ├── validation.ts         # Validação input
│   │   └── ... (mais utilitários)
│   ├── config/                   # Configurações
│   │   └── firebase.ts           # Init Firebase Admin
│   ├── index.ts                  # Entry point (exports)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── shared/                        # Código compartilhado
│   ├── types/                    # Types compartilhados
│   │   ├── store.ts              # Store, StoreSettings
│   │   ├── operations.ts         # Operations types
│   │   ├── payment.ts            # Payment types
│   │   └── ... (mais tipos)
│   ├── schemas/                  # Validação Zod
│   │   ├── store.ts              # Schema Store
│   │   └── ... (mais schemas)
│   └── constants/                # Constantes
│       └── roles.ts              # ROLES_HIERARCHY, permissions
│
├── android/                       # Android Native (Capacitor)
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml   # Declaração de permissões + activities
│   │   ├── java/com/open_kiosk/ # Código Java nativo
│   │   │   ├── MainActivity.kt    # Activity raiz (WebView)
│   │   │   ├── PlugPagTerminalPlugin.kt       # Plugin PlugPag
│   │   │   ├── BluetoothSerialPlugin.kt       # Plugin Bluetooth serial
│   │   │   ├── USBSerialPlugin.kt             # Plugin USB serial
│   │   │   ├── KioskModePlugin.kt             # Plugin Lock Task
│   │   │   └── KioskLifecycleReceiver.kt      # Boot/upgrade receiver
│   │   ├── res/                  # Recursos Android
│   │   └── assets/public/        # Assets web (build da app)
│   ├── build.gradle              # Build Android
│   └── settings.gradle           # Configuração Gradle
│
├── firmware/                      # ESP32 Firmware
│   ├── firmware.ino              # Código ESP32
│   ├── ManualCircuito.md         # Esquema eletrônico
│   └── build/                    # Build artifacts
│
├── capacitor.config.ts            # Config Capacitor
├── firestore.rules               # Firestore Security Rules
├── firestore.indexes.json        # Índices Firestore
├── firebase.json                 # Config deploy Firebase
├── vercel.json                   # Config Vercel (Admin)
├── admin/vercel.json             # Config Vercel (Admin standalone)
├── package.json                  # Root dependencies
├── tsconfig.json                 # TypeScript root
└── vite.config.ts                # Vite root
```

---

## 3. FLUXOS PRINCIPAIS

### 3.1 Fluxo de Autenticação

```
┌─────────────────────────────────────────────────────────────────┐
│ FLUXO DE AUTENTICAÇÃO                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User              Kiosk Web              Firebase             │
│    │                    │                      │               │
│    │  1. Acessa URL     │                      │               │
│    ├─────────────────►  │                      │               │
│    │                    │                      │               │
│    │  2. Clica "Login"  │                      │               │
│    ├─────────────────►  │                      │               │
│    │                    │  3. signInWithEmailAndPassword()     │
│    │                    ├─────────────────────►│               │
│    │                    │                      │               │
│    │                    │  4. Retorna { user, token }          │
│    │                    │◄─────────────────────┤               │
│    │                    │                      │               │
│    │  5. Redireciona /store-select             │               │
│    │◄─────────────────┤                      │               │
│    │                    │                      │               │
│    │  6. Seleciona loja │                      │               │
│    ├─────────────────►  │                      │               │
│    │                    │  7. Salva franchiseId + storeId      │
│    │                    │     em Firestore                     │
│    │                    ├─────────────────────►│               │
│    │                    │                      │               │
│    │  8. Redireciona /shop                     │               │
│    │◄─────────────────┤                      │               │
│    │                    │                      │               │
│    │                    │  9. useAuth() + useStoreSettings()   │
│    │                    │     carregam dados                   │
│    │                    │                      │               │
│    │  10. Shop renderiza│                      │               │
│    │◄─────────────────┤                      │               │
│    │                    │                      │               │
└─────────────────────────────────────────────────────────────────┘

Arquivos-chave:
• AuthContext.tsx — gerencia sessão/user
• LoginPage.tsx — UI de login
• StoreSelectPage.tsx — seleção de loja
• authService.ts — Firebase signIn/signOut
• firebase.ts — Firebase SDK init
```

### 3.2 Fluxo de Compra e Pagamento

```
┌──────────────────────────────────────────────────────────────────────┐
│ FLUXO COMPLETO DE COMPRA → PAGAMENTO → DISPENSAÇÃO                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User              Kiosk Web           Firebase    Terminal  ESP32   │
│    │                    │                 │           │        │    │
│    │ 1. Clica produto   │                 │           │        │    │
│    ├───────────────────►│                 │           │        │    │
│    │                    │                 │           │        │    │
│    │ 2. Adiciona ao     │                 │           │        │    │
│    │    carrinho        │                 │           │        │    │
│    ├───────────────────►│                 │           │        │    │
│    │                    │                 │           │        │    │
│    │ 3. Clica Checkout  │                 │           │        │    │
│    ├───────────────────►│                 │           │        │    │
│    │                    │  4. createPayment() callable│        │    │
│    │                    ├────────────────►│           │        │    │
│    │                    │                 │           │        │    │
│    │                    │  5. Retorna paymentId      │        │    │
│    │                    │◄─────────────────           │        │    │
│    │                    │                 │           │        │    │
│    │ 6. PaymentFlow UI  │                 │           │        │    │
│    │◄───────────────────┤                 │           │        │    │
│    │                    │                 │           │        │    │
│    │ PAGAMENTO ATIVADO  │                 │           │        │    │
│    │ ─────────────────  │                 │           │        │    │
│    │                    │                 │           │        │    │
│    │ 7. Escolhe método  │                 │           │        │    │
│    │    (PIX/Credit)    │                 │           │        │    │
│    ├───────────────────►│                 │           │        │    │
│    │                    │                 │           │        │    │
│    │ 8. PlugPag payment │                 │           │        │    │
│    │    (credit/debit)  │                 │           │        │    │
│    ├───────────────────┼────────────────────────────►│        │    │
│    │                    │                 │  Processa │        │    │
│    │                    │                 │  transação│        │    │
│    │                    │                 │           │        │    │
│    │ 9. Retorna result  │                 │           │        │    │
│    │◄───────────────────┼─────────────────┤◄──────────┤        │    │
│    │                    │                 │           │        │    │
│    │ 10. Se OK: UI      │                 │           │        │    │
│    │     avança para    │                 │           │        │    │
│    │     dispensação    │                 │           │        │    │
│    ├───────────────────►│                 │           │        │    │
│    │                    │                 │           │        │    │
│    │                    │  11. updateOrderStatus('paid')       │    │
│    │                    ├────────────────►│           │        │    │
│    │                    │                 │           │        │    │
│    │ 12. DrinkPickup    │                 │  12b. Envia         │    │
│    │     Screen         │                 │      comando        │    │
│    │◄───────────────────┤                 ├───────────────────►│    │
│    │                    │                 │           │        │    │
│    │ 13. Aguarda        │                 │           │  Dispensa   │
│    │     dispensação    │                 │           │        │    │
│    │                    │                 │           │ ◄──────┤    │
│    │                    │                 │           │        │    │
│    │ 14. Reciprocal     │  14b. updateOrderStatus('dispensed') │    │
│    │     retirado       │◄────────────────┤───────────────────►│    │
│    ├───────────────────►│                 │           │        │    │
│    │                    │                 │           │        │    │
│    │ 15. Tela obrigada  │                 │           │        │    │
│    │     repouso (20s)  │                 │           │        │    │
│    ├───────────────────►│                 │           │        │    │
│    │                    │                 │           │        │    │
│    │ 16. Volta para     │                 │           │        │    │
│    │     Shop           │                 │           │        │    │
│    │◄───────────────────┤                 │           │        │    │
│    │                    │                 │           │        │    │
└──────────────────────────────────────────────────────────────────────┘

Estados de ordem: draft → paid → dispensed
Estados de pagamento: pending → processing → approved/rejected
Estados de dispensação: idle → dispensing → dispensed/failed_dispense

Arquivos-chave:
• Shop.tsx — vitrine + carrinho
• Cart.tsx — UI do carrinho
• Checkout.tsx — tela checkout
• PaymentFlow.tsx — orquestração pagamento
• plugpagPaymentService.ts — SDK PlugPag
• paymentService.ts — lógica de pagamento
• dispenserService.ts — controle de dispensação
• esp32CommunicationService.ts — comunicação ESP32
• functions/src/payments/ — backend PagBank/MercadoPago
```

### 3.3 Fluxo de Dispensação (ESP32)

```
┌──────────────────────────────────────────────────┐
│ FLUXO DE DISPENSAÇÃO VIA ESP32                   │
├──────────────────────────────────────────────────┤
│                                                  │
│ Kiosk Web          ESP32 Serial     Hardware    │
│    │                    │               │       │
│    │ 1. Coleta pedido   │               │       │
│    │    (volumes, taps) │               │       │
│    ├───────────────────►│               │       │
│    │                    │               │       │
│    │                    │ 2. Prepara    │       │
│    │                    │    comando    │       │
│    │                    │    JSON       │       │
│    │                    │               │       │
│    │ 3. Envia via       │               │       │
│    │    BLE/USB/WiFi    │               │       │
│    │                    ├──────────────►│       │
│    │                    │               │ Ativa │
│    │                    │               │ solenóides
│    │                    │               │ dispensa
│    │                    │               │       │
│    │                    │ 4. Confirma   │       │
│    │                    │    execução   │       │
│    │◄───────────────────┤◄──────────────┤       │
│    │                    │               │       │
│    │ 5. updateOrder     │               │       │
│    │    ('dispensed')   │               │       │
│    │                    │               │       │
│    │ 6. Salva na        │               │       │
│    │    Firestore       │               │       │
│    │                    │               │       │
└──────────────────────────────────────────────────┘

Protocolo ESP32:
{
  "action": "dispense",
  "volumes": {
    "tap_0": 500,      // mL
    "tap_1": 250
  },
  "timeout": 30        // segundos
}

Resposta:
{
  "status": "success",
  "dispensed": { "tap_0": 495, "tap_1": 248 },
  "duration_ms": 8500
}

Arquivos-chave:
• esp32CommunicationService.ts — gerencia conexão
• esp32SerialService.ts — protocolo serial
• dispenserService.ts — orquestração
• firmware/firmware.ino — código ESP32
```

### 3.4 Fluxo de Relatórios (Admin)

```
┌────────────────────────────────────────────────────────┐
│ FLUXO DE RELATÓRIOS/ADMIN                              │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Admin User    Admin Web          Firebase   Functions  │
│    │               │                 │           │     │
│    │ 1. Acessa     │                 │           │     │
│    │    /dashboard │                 │           │     │
│    ├──────────────►│                 │           │     │
│    │               │                 │           │     │
│    │               │ 2. Carrega      │           │     │
│    │               │    stores,      │           │     │
│    │               │    metrics      │           │     │
│    │               ├────────────────►│           │     │
│    │               │                 │           │     │
│    │               │ 3. Retorna dados│           │     │
│    │               │◄────────────────┤           │     │
│    │               │                 │           │     │
│    │ 4. Dashboard  │                 │           │     │
│    │    renderizado│                 │           │     │
│    │◄──────────────┤                 │           │     │
│    │               │                 │           │     │
│    │ 5. Seleciona  │                 │           │     │
│    │    período    │                 │           │     │
│    ├──────────────►│                 │           │     │
│    │               │                 │           │     │
│    │               │ 6. aggregateDailySales()   │     │
│    │               │ callable                   │     │
│    │               ├──────────────────────────►│     │
│    │               │                 │    Processa  │
│    │               │                 │    sales,    │
│    │               │                 │    wastage,  │
│    │               │                 │    inventory │
│    │               │◄──────────────────────────┤     │
│    │               │                 │           │     │
│    │ 7. Relatório  │                 │           │     │
│    │    atualizado │                 │           │     │
│    │◄──────────────┤                 │           │     │
│    │               │                 │           │     │
└────────────────────────────────────────────────────────┘

Relatórios disponíveis:
• Dashboard: resumo vendas, top produtos, tendências
• Relatórios detalhados: vendas por período, análise produto
• Auditoria: logs de ações, rastreabilidade
• Previsão: demand forecast (ML com dados clima)
• ERP: gestão torneiras, barris, manutenção
• Ranking: gamificação, leaderboards, prêmios

Arquivos-chave:
• Admin.tsx → páginas dashboard, reports, audit
• analyticsService.ts → agregação métricas
• functions/src/analytics/ → backend agregação
• functions/src/forecast/ → previsão demanda
```

---

## 4. INTEGRAÇÃO DE PAGAMENTOS

### 4.1 Gateway: PlugPag (PagBank)

```
┌─────────────────────────────────────────────────┐
│ PLUGPAG (PagBank) INTEGRATION                   │
├─────────────────────────────────────────────────┤
│                                                 │
│ Moderninha PRO 2 (Terminal de Pagamento)       │
│    ▲                                            │
│    │ Bluetooth Classic (RFCOMM)                 │
│    │                                            │
│  ┌─┴──────────────────────────────────────────┐│
│  │ Capacitor Native Plugin (Android)           ││
│  │ • PlugPagTerminalPlugin.kt                  ││
│  │ • JNI Bridge para SDK Java                  ││
│  └────┬─────────────────────────────────────────┤
│       │                                        │
│  ┌────▼──────────────────────────────────────────┐
│  │ plugpagPaymentService.ts                    │
│  │ • Gerencia estado terminal                  │
│  │ • Ciclo de vida: auth → dispense → callback │
│  │ • Estados: idle → connected → approved      │
│  └────┬──────────────────────────────────────────┘
│       │                                        │
│  ┌────▼──────────────────────────────────────────┐
│  │ PaymentFlow.tsx                             │
│  │ • UI de entrada de pagamento                │
│  │ • Mostra QR code (PIX)                      │
│  │ • Aguarda card (credit/debit)               │
│  └────┬──────────────────────────────────────────┘
│       │                                        │
│  ┌────▼──────────────────────────────────────────┐
│  │ functions/src/payments/onPaymentUpdated.ts │
│  │ • Valida resultado pagamento                │
│  │ • Sincroniza com Firestore                  │
│  │ • Registra no ledger                        │
│  └─────────────────────────────────────────────┘

Fluxo de Autenticação (PagBank):
1. requestAuthentication() abre activity nativa
2. PlugPagActivity + PlugPagAuthenticationFragment
3. Usuário faz login com email/senha PagBank
4. Token retorna via BroadcastReceiver
5. Salvo em localStorage + sessionStorage
6. Usado em doPayment() nativo

Métodos de Pagamento:
• PIX (QR Code) — instantâneo
• Crédito à vista
• Crédito parcelado (2-12x)
• Débito
• Voucher (vale)

Arquivos-chave:
• android/app/src/main/java/...PlugPagTerminalPlugin.kt
• src/plugins/plugpagTerminal.ts — type definitions
• src/services/plugpagPaymentService.ts — orquestração
• src/hooks/usePlugPagAutoConnect.ts — auto-conexão
• functions/src/payments/pagbankWebhook.ts — webhook atualiza status
```

### 4.2 Gateway: MercadoPago

```
┌────────────────────────────────────────┐
│ MERCADOPAGO INTEGRATION                │
├────────────────────────────────────────┤
│                                        │
│ Kiosk Web                  MercadoPago │
│    │                            ▲      │
│    │ 1. createPayment()         │      │
│    │    callable                │      │
│    ├───────────────────────────►│      │
│    │                            │      │
│    │ 2. Retorna                 │      │
│    │    {qr_code, payment_id}   │      │
│    │◄──────────────────────────┤      │
│    │                            │      │
│    │ 3. Usuário escaneiaQR      │      │
│    │    ou insere cartão        │      │
│    │ (em app MercadoPago)       │      │
│    │                            │      │
│    │                    Processa│      │
│    │                    transação
│    │                            │      │
│    │ 4. Webhook                 │      │
│    │    notifica resultado      │      │
│    │◄──────────────────────────┤      │
│    │                            │      │
│    │ 5. updateOrder('paid')     │      │
│    │                            │      │
│
Fluxo:
1. Kiosk cria payment via callable createPayment()
2. Backend retorna QR code ou URL de pagamento
3. Usuario paga em app MercadoPago ou wallet
4. MercadoPago envia webhook com resultado
5. backend atualiza payment status
6. Kiosk sincroniza e libera dispensação

Arquivo-chave:
• functions/src/payments/mercadopagoWebhook.ts
• src/services/paymentService.ts (orquestração)
• src/config/paymentGateway.ts (enum gateways)
```

---

## 5. FIRESTORE - ESTRUTURA DE DADOS

### 5.1 Hierarquia de Collections

```
firestore/
├── superadmins/{doc}
│   └── Superadministradores globais
│
├── users/{uid}
│   ├── id: string (UID Firebase)
│   ├── email: string
│   ├── name: string
│   ├── role: 'superadmin' | 'franchiseadmin' | 'manager' | 'cashier' | 'customer'
│   ├── permissions: string[]
│   ├── franchiseId: string (se não superadmin)
│   ├── storeIds: string[] (lojas que pode acessar)
│   ├── lastLogin: Timestamp
│   └── createdAt: Timestamp
│
├── franchises/{franchiseId}
│   ├── id: string (UUID)
│   ├── name: string
│   ├── legalName: string
│   ├── cnpj: string
│   ├── activeUntil: Timestamp
│   ├── stripeCustomerId: string
│   ├── paymentGatewayConfig: {
│   │   provider: 'plugpag' | 'mercadopago'
│   │   enabledMethods: { cash, pix, credit, debit }
│   │   ... gateway-specific fields
│   │}
│   ├── settings: { ... }
│   ├── createdAt: Timestamp
│   │
│   ├── members/{uid}
│   │   └── Membros da franquia + permissões
│   │
│   ├── stores/{storeId}
│   │   ├── id: string (UUID)
│   │   ├── name: string
│   │   ├── address: string
│   │   ├── city: string
│   │   ├── gps: { latitude, longitude }
│   │   ├── timezone: string
│   │   ├── paymentGatewayConfig: { ... }
│   │   ├── attractScreenEnabled: boolean
│   │   ├── attractTimeoutSeconds: number
│   │   ├── kioskModeEnabled: boolean
│   │   ├── createdAt: Timestamp
│   │   │
│   │   ├── products/{productId}
│   │   │   ├── id: string
│   │   │   ├── name: string
│   │   │   ├── category: string
│   │   │   ├── image: string (Storage URL)
│   │   │   ├── description: string
│   │   │   ├── price: number (centavos)
│   │   │   ├── active: boolean
│   │   │   ├── stock: number
│   │   │   ├── sizes: [{ key, label, mlPerUnit, priceMultiplier }]
│   │   │   └── tags: string[]
│   │   │
│   │   ├── orders/{orderId}
│   │   │   ├── id: string
│   │   │   ├── items: [{product, size, quantity, unitPrice}]
│   │   │   ├── totalAmount: number
│   │   │   ├── status: 'draft' | 'paid' | 'dispensed' | 'failed'
│   │   │   ├── paymentId: string (FK payments)
│   │   │   ├── dispenseStatus: 'idle' | 'dispensing' | 'dispensed' | 'failed_dispense'
│   │   │   ├── customerName: string (opcional, para ranking)
│   │   │   ├── customerIdentification: string (opcional)
│   │   │   ├── createdAt: Timestamp
│   │   │   ├── paidAt: Timestamp
│   │   │   └── dispensedAt: Timestamp
│   │   │
│   │   ├── payments/{paymentId}
│   │   │   ├── id: string
│   │   │   ├── orderId: string (FK orders)
│   │   │   ├── amount: number
│   │   │   ├── currency: 'BRL'
│   │   │   ├── status: 'pending' | 'processing' | 'approved' | 'rejected'
│   │   │   ├── gateway: 'plugpag' | 'mercadopago' | 'cash' | 'pix'
│   │   │   ├── provider_payment_id: string
│   │   │   ├── method: 'credit' | 'debit' | 'pix' | 'cash' | 'voucher'
│   │   │   ├── cardLastDigits: string (masked)
│   │   │   ├── cardBrand: string ('visa', 'mastercard', etc)
│   │   │   ├── holderName: string (masked)
│   │   │   ├── installments: number
│   │   │   ├── createdAt: Timestamp
│   │   │   └── updatedAt: Timestamp
│   │   │
│   │   ├── devices/{deviceId}
│   │   │   ├── id: string (Device ID gerado)
│   │   │   ├── serialNumber: string
│   │   │   ├── model: string ('black-shark-bsm1')
│   │   │   ├── osVersion: string ('android-15')
│   │   │   ├── appVersion: string
│   │   │   ├── lastOnlineAt: Timestamp
│   │   │   ├── gpsLat: number
│   │   │   ├── gpsLng: number
│   │   │   ├── gpsTimestamp: Timestamp
│   │   │   └── hardware: {
│   │   │       esp32_connected: boolean,
│   │   │       esp32_last_seen: Timestamp,
│   │   │       plugpag_connected: boolean,
│   │   │       plugpag_last_seen: Timestamp
│   │   │   }
│   │   │
│   │   ├── dailyStats/{date}
│   │   │   ├── date: string (YYYY-MM-DD)
│   │   │   ├── ordersCount: number
│   │   │   ├── salesTotal: number
│   │   │   ├── averageTicket: number
│   │   │   └── topProducts: [{product, quantity}]
│   │   │
│   │   └── [ERP] taps/{tapId}
│   │       ├── id: string
│   │       ├── name: string
│   │       ├── position: number (0, 1, 2...)
│   │       ├── plugpagDeviceId: string
│   │       ├── liquid: { name, color, alcohol_pct }
│   │       ├── kegId: string (FK kegs)
│   │       ├── status: 'idle' | 'pouring' | 'error'
│   │       ├── dailyCount: number (litros)
│   │       ├── lastResetAt: Timestamp
│   │       └── maintenanceSchedule: { ... }
│   │
│   ├── [ERP] kegs/{kegId}
│   │   ├── id: string
│   │   ├── barrelCode: string
│   │   ├── liquid: { name, type }
│   │   ├── capacityLiters: number
│   │   ├── currentLiters: number
│   │   ├── status: 'active' | 'empty' | 'maintenance'
│   │   ├── assignedTaps: [tapIds]
│   │   └── lastUpdatedAt: Timestamp
│   │
│   ├── metrics/{docType}/{docId}
│   │   ├── hourly sales, daily sales, weekly sales
│   │   └── aggregated metrics (para dashboard admin)
│   │
│   └── auditLogs/{logId}
│       ├── timestamp: Timestamp
│       ├── action: string
│       ├── userId: string
│       ├── oldValues: object
│       ├── newValues: object
│       └── details: string
│
├── settings/{docId}
│   └── Configurações globais da plataforma
│
├── analytics/{type}/{id}
│   └── Agregações (orders, wastage, etc)
│
└── audit_logs/{logId}
    └── Legacy audit logs (legado, gradualmente migrado)
```

### 5.2 Índices Composite (Firestore)

```
Índices criados em firestore.indexes.json:

1. franchises/{franchiseId}/members
   - fields: role, createdAt
   - para: listar membros por role

2. franchises/{franchiseId}/stores/{storeId}/orders
   - fields: status, createdAt
   - para: listar pedidos por status em ordem temporal

3. franchises/{franchiseId}/stores/{storeId}/payments
   - fields: status, createdAt
   - para: listar pagamentos pendentes

4. franchises/{franchiseId}/notifications
   - fields: read, createdAt
   - para: notificações não lidas
```

---

## 6. SEGURANÇA

### 6.1 Firebase Security Rules

```firestore
Padrão geral em firestore.rules:

match /users/{uid} {
  allow read: if request.auth.uid == uid
  allow write: if request.auth.uid == uid && hasPermission('edit_own_profile')
}

match /franchises/{franchiseId} {
  allow read: if isMember(franchiseId) && hasRole(['franchiseadmin', 'manager'])
  allow write: if isFranchiseAdmin(franchiseId)
  
  match /stores/{storeId} {
    allow read: if canAccessStore(franchiseId, storeId)
    allow create: if isFranchiseAdmin(franchiseId)
    allow update: if canAccessStore(franchiseId, storeId)
    allow delete: if isFranchiseAdmin(franchiseId)
    
    match /orders/{orderId} {
      allow read: if canAccessStore(franchiseId, storeId)
      allow create: if true (public create, no auth required for kiosk)
      allow update: if canAccessStore(franchiseId, storeId)
    }
  }
}

match /audit_logs/{docId} {
  allow read: if isSuperAdmin() || isFranchiseAdmin(getUserFranchiseId())
  allow create: if true (backend triggers)
}
```

### 6.2 Auth Claims (Custom)

```json
Exemplo de custom claims adicionados ao token Firebase:

{
  "superadmin": true,
  "franchiseAdmin": ["franchise_id_1", "franchise_id_2"],
  "manager": ["store_id_1"],
  "permissions": ["create_store", "edit_payments", "view_audit"],
  "storeIds": ["store_id_1", "store_id_2"],
  "franchiseId": "franchise_id_1"
}
```

---

## 7. CI/CD E DEPLOY

### 7.1 Estrutura de Deploy

```
┌──────────────────────────────────────────────┐
│ DEPLOY PIPELINE                              │
├──────────────────────────────────────────────┤
│                                              │
│ GitHub Repo                                  │
│    │                                         │
│    ├─► Kiosk Web + Admin (Firebase Hosting) │
│    │       npm run build                     │
│    │       npm run build:admin               │
│    │       firebase deploy --only hosting    │
│    │                                         │
│    ├─► Cloud Functions (Firebase Functions) │
│    │       cd functions && npm run build     │
│    │       firebase deploy --only functions │
│    │                                         │
│    ├─► Admin Standalone (Vercel)            │
│    │       cd admin && npm run build         │
│    │       deploy → vercel                   │
│    │                                         │
│    └─► Android APK/AAB (Google Play)        │
│           npm run build                      │
│           npx cap sync android               │
│           ./gradlew bundleRelease            │
│
Ambientes:
• Development: localhost (vite dev)
• Staging: Firebase preview channel
• Production: Firebase hosting + Vercel
```

### 7.2 Build Android (Capacitor)

```bash
# Build steps
npm run build                              # Build React web
npx cap sync android                      # Sync web assets
cd android
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
./gradlew assembleDebug                   # Debug APK
./gradlew bundleRelease                   # Release AAB

# Output
android/app/build/outputs/apk/debug/*.apk
android/app/build/outputs/bundle/release/*.aab
```

---

## 8. INTEGRAÇÕES EXTERNAS

| Serviço | Uso | Auth |
|---------|-----|------|
| **Firebase** | Auth, Firestore, Storage, Hosting, Functions | Service Account + SDKs |
| **PagBank (PlugPag SDK)** | Terminal pagamento | OAuth token (env) |
| **MercadoPago** | Pagamento PIX/cartão | Access token (env) |
| **Stripe** | Billing empresarial | Webhook secret (env) |
| **OpenWeatherMap** | Dados clima (forecast) | API key (env) |
| **SMTP (Gmail)** | Envio email convites | App password (env) |
| **Vercel** | Deploy Admin app | Git integration |
| **Google Play** | Store Android | Developer account |

---

## 9. FLUXO DE DADOS (Data Flow) - Resumido

```
Kiosk Web
├─ Lê: products, orders, payments → Firestore
├─ Escreve: orders (paid, dispensed) → Firestore + Cloud Functions
├─ Comunica: ESP32 via BLE/USB/WiFi (JSON protocol)
├─ Chama: createPayment() callable → backend valida + PagBank/MercadoPago
├─ Ouve: webhook updates pagamento → backend → Firestore
└─ Renderiza: UI atualizada (React Query + Context)

Admin Web
├─ Lê: franchises, stores, members, orders, payments, audit_logs → Firestore
├─ Escreve: member invites, store config, claims → Firestore + Functions
├─ Chama: analytics callables → backend agrega dados
├─ Ouve: real-time listeners Firestore
└─ Renderiza: Dashboard, reports, audit trail

Cloud Functions
├─ Triggers: onCreate(user), onOrderCreated, onPaymentUpdated
├─ Webhooks: PagBank, MercadoPago, Stripe
├─ Callables: createPayment, setAdminClaims, aggregateDailySales
├─ Scheduled: aggregateOperationalDaily (cron), checkKegLevels
├─ Lê/Escreve: Firestore, externas APIs
└─ Responde: Kiosk Web + Admin Web

ESP32 Hardware
├─ Recebe: JSON comandos dispensação via serial (BLE/USB/WiFi)
├─ Executa: ativa solenoides, conta volume
├─ Retorna: status, volumes reais
└─ Comunica: Kiosk Web sincroniza resultado
```

---

## 10. ROADMAP TÉCNICO

| Prioridade | Item | Razão |
|------------|------|-------|
| **P0** | Validação segurança PlugPag (PAN masking) | Compliance PCI-DSS |
| **P1** | Consolidar feedback visual (use-toast vs sonner) | UX consistente |
| **P2** | Implementar recovery automático de falhas ESP32 | Resiliência |
| **P3** | ML forecasting com mais histórico | Previsão acurada |
| **P4** | Multi-language completo (atual: PT-BR/EN/ES parcial) | Globalização |

---

## 11. CONTATOS E REFERÊNCIAS

| Recurso | Link/Local |
|---------|-----------|
| README principal | `/README.md` |
| Configuração Capacitor | `/capacitor.config.ts` |
| Firestore rules | `/firestore.rules` |
| PlugPag manual SDK | `/plugpag-master-4.x/` |
| Manual ESP32 hardware | `/firmware/ManualCircuito.md` |
| Admin app config | `/admin/src/` |
| Functions backend | `/functions/src/index.ts` |

---

**Fim do Mapa de Arquitetura**
