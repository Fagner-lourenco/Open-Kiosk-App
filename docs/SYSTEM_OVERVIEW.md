# Open Kiosk App - System Overview (Visual)

**Documentos criados:** 
- `ARCHITECTURE_MAPPING.md` — Mapa detalhado (11 seções)
- `QUICK_REFERENCE.md` — Guia rápido de consulta

---

## ARQUITETURA DE ALTO NÍVEL

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         OPEN KIOSK - STACK COMPLETO                      │
└──────────────────────────────────────────────────────────────────────────┘

                           ┌─── FRONTEND ────┐
                           │                 │
                    ┌──────▼────────┐   ┌───▼──────────┐
                    │ Kiosk Web App │   │ Admin Web App│
                    │   (src/)      │   │ (admin/src/) │
                    │               │   │              │
                    │ • React 18    │   │ • React 18   │
                    │ • TailwindCSS │   │ • TypeScript │
                    │ • TypeScript  │   │ • Vercel     │
                    │ • Vite        │   │              │
                    │               │   │              │
                    │ Porta: 8080   │   │ Porta: 5174  │
                    └──────┬────────┘   └───┬──────────┘
                           │                │
                    ┌──────▼────────────────▼─────────┐
                    │   Firebase (Backend-as-Service) │
                    │   ─────────────────────────────  │
                    │  • Firestore Database            │
                    │  • Authentication (Google)       │
                    │  • Cloud Storage (media)         │
                    │  • Hosting (web)                 │
                    └───┬────────┬──────────┬──────────┘
                        │        │          │
                 ┌──────▼┐ ┌────▼─┐  ┌────▼───┐
                 │       │ │      │  │        │
         ┌──────▼──────┐ │ │   ┌──▼─▼──┐  ┌──▼────────┐
         │   Cloud     │ │ │   │       │  │ Firestore │
         │ Functions   │ │ │   │       │  │ Security  │
         │ (functions) │ │ │   │       │  │  Rules    │
         │             │ │ │   │       │  │           │
         │ • Payment   │ │ │   │       │  │ • Row-    │
         │   Processing│ │ │   │       │  │   level   │
         │ • Webhooks  │ │ │   │       │  │   access  │
         │ • Analytics │ │ │   │       │  │ • Claims  │
         │ • Auth      │ │ │   │       │  │   check   │
         │   Claims    │ │ │   │       │  │           │
         │ • ERP       │ │ │   │       │  │           │
         │ • Forecast  │ │ │   │       │  │           │
         └──────┬──────┘ │ │   └───────┘  └───────────┘
                │        │ │
         ┌──────▼────────▼─▼──────────────┐
         │  Firebase + External APIs      │
         │ ─────────────────────────────  │
         │ • PagBank (PlugPag SDK)        │
         │ • MercadoPago API              │
         │ • Stripe Webhooks              │
         │ • OpenWeatherMap (forecast)    │
         │ • SMTP (email convites)        │
         │ • Google Play (Android)        │
         └────────────────────────────────┘
                │
    ┌───────────┼───────────┬──────────────┐
    │           │           │              │
┌───▼────┐  ┌──▼────┐  ┌───▼────┐  ┌────▼────┐
│ Android│  │ Native│  │ Tablets│  │ Payment │
│ Native │  │ Plugins  │ (device)  │ Terminals
│(Capacitor) │(PlugPag,│           │
│            │BLE, USB) │           │ • PlugPag
│ • WebView  │         │           │   Terminal
│ • Plugins  │ • Lock  │           │   (BLE)
│ • Perms    │   Task  │           │
│            │ • Native│           │ • QR Code
│            │   Bridge│           │   (PIX)
│            │         │           │
└────────────┘  └───────┘  ┌───────▼────────┐
                           │ ESP32 Hardware │
                           │ ──────────────  │
                           │ • BLE/USB/WiFi │
                           │ • Torneiras    │
                           │ • Bombas       │
                           │ • Sensores     │
                           └────────────────┘
```

---

## FLUXO PRINCIPAL: COMPRA → PAGAMENTO → DISPENSAÇÃO

```
Customer                Shop UI          Payment          Hardware        Backend
  │                       │                System           (ESP32)       (Firebase)
  │                       │                  │                 │              │
  │   1. Seleciona       │                  │                 │              │
  │      produto         │                  │                 │              │
  ├──────────────────────>│                  │                 │              │
  │                       │ 2. Abre          │                 │              │
  │                       │    checkout      │                 │              │
  │                       │    modal         │                 │              │
  │   3. Clica            │                  │                 │              │
  │      "Pagar agora"    │                  │                 │              │
  ├──────────────────────>│                  │                 │              │
  │                       │ 4. createPayment()|────────────────┼──────────────>│
  │                       │    callable      │                 │              │
  │                       │                  │ 5. Cria payment │              │
  │                       │                  │    document     │              │
  │                       │                  │                 │ 6. Webhook  │
  │                       │                  │                 │    listener │
  │                       │                  │                 │<─────────────┤
  │   Terminal aguarda    │                  │                 │              │
  │   cartão/PIX          │                  │                 │              │
  │   QR exibido          │                  │                 │              │
  ├──────────────────────>│                  │                 │              │
  │                       │ 7. doPayment()   │                 │              │
  │                       │    PlugPag SDK   │─┐               │              │
  │                       │                  │ │ 8. Conecta BT │              │
  │                       │                  │ └──────────────>│              │
  │                       │                  │                 │ 9. Processa │
  │                       │                  │                 │    transação│
  │                       │                  │                 │              │
  │   Insere cartão OU    │                  │                 │              │
  │   escaneia QR         │                  │                 │              │
  ├────────────────────────────────────────────────────────────>│              │
  │                       │                  │                 │ 10. Valida  │
  │                       │                  │                 │     PAN/CVV │
  │                       │                  │                 │     (seguro)│
  │                       │                  │                 │              │
  │                       │ 11. Retorna      │                 │              │
  │                       │     resultado    │<────────────────┤              │
  │                       │     aprovado     │                 │              │
  │                       │                  │                 │              │
  │                       │ 12. PagBank      │                 │              │
  │                       │     Webhook      │ 13. Atualiza   │              │
  │                       │     notification │     payment    │              │
  │                       │                  │     → 'approved'              │
  │                       │                  │                 │              │
  │                       │ 14. Listener     │                 │              │
  │                       │     detects paid │<────────────────┤              │
  │                       │     order        │                 │              │
  │                       │                  │                 │              │
  │  Tela de retirada     │                  │ 15. Envia       │              │
  │  (DrinkPickupScreen)  │                  │     comando     │              │
  │  aguarda dispensação  │                  │     dispense    │──────────────>│
  ├──────────────────────>│                  │                 │              │
  │                       │                  │                 │              │
  │                       │                  │                 │ 16. Ativa    │
  │                       │                  │                 │     solenó.  │
  │                       │                  │                 │     dispensa │
  │                       │                  │                 │              │
  │  ✓ Retirou bebida     │                  │                 │ 17. Confirma │
  │                       │ 18. update       │                 │     sucesso  │
  │                       │     Order        │<────────────────┤              │
  │                       │     'dispensed'  │                 │ 19. Atualiza│
  │                       │                  │                 │     order   │
  │                       │                  │<─────────────────────────────>│
  │                       │                  │                 │              │
  │                       │ 20. Tela repouso │                 │              │
  │                       │     20 segundos  │                 │              │
  ├──────────────────────>│                  │                 │              │
  │                       │                  │                 │              │
  │  [Tela volta ativos]  │                  │                 │              │
  │  (Shop)               │                  │                 │              │
  │                       │                  │                 │              │
  └───────────────────────┴──────────────────┴─────────────────┴──────────────┘
```

---

## DADOS: FIRESTORE STRUCTURE

```
Database (Firestore)
│
├── 📁 franchises/{franchiseId}          ← Franquia
│   ├── 🔹 name: "Franquia XYZ"
│   ├── 🔹 cnpj: "12.345.678/0001-00"
│   ├── 🔹 activeUntil: Timestamp
│   ├── 🔹 paymentGatewayConfig: { provider: 'plugpag', ... }
│   │
│   ├── 📁 stores/{storeId}              ← Lojas
│   │   ├── 🔹 name: "Loja Centro"
│   │   ├── 🔹 gps: { latitude, longitude }
│   │   │
│   │   ├── 📁 products/                 ← Bebidas
│   │   │   └── {productId}: { name, price, image, active, sizes... }
│   │   │
│   │   ├── 📁 orders/                   ← Pedidos
│   │   │   └── {orderId}: {
│   │   │       items: [...],
│   │   │       totalAmount: 2500,
│   │   │       status: 'paid' | 'dispensed',
│   │   │       paymentId: '...',
│   │   │       dispenseStatus: 'dispensing' | 'dispensed',
│   │   │       createdAt: Timestamp,
│   │   │       paidAt: Timestamp,
│   │   │       dispensedAt: Timestamp
│   │   │     }
│   │   │
│   │   ├── 📁 payments/                 ← Transações
│   │   │   └── {paymentId}: {
│   │   │       amount: 2500,
│   │   │       gateway: 'plugpag',
│   │   │       status: 'approved' | 'rejected',
│   │   │       method: 'credit' | 'debit' | 'pix',
│   │   │       cardLastDigits: '****1234',
│   │   │       createdAt: Timestamp,
│   │   │       updatedAt: Timestamp
│   │   │     }
│   │   │
│   │   ├── 📁 devices/                  ← Tablets
│   │   │   └── {deviceId}: {
│   │   │       serialNumber: 'xyz123',
│   │   │       lastOnlineAt: Timestamp,
│   │   │       gpsLat/gpsLng: coordinates,
│   │   │       hardware: { esp32_connected, plugpag_connected }
│   │   │     }
│   │   │
│   │   ├── 📁 taps/                     ← Torneiras (ERP)
│   │   │   └── {tapId}: {
│   │   │       name: "Tap 1",
│   │   │       liquid: { name, color },
│   │   │       status: 'idle' | 'pouring',
│   │   │       dailyCount: 45.5 (litros)
│   │   │     }
│   │   │
│   │   └── 📁 dailyStats/              ← Relatórios dia
│   │       └── {date}: { ordersCount, salesTotal, ... }
│   │
│   ├── 📁 members/{uid}                ← Equipe
│   │   └── { role: 'manager', permissions: [...] }
│   │
│   └── 📁 auditLogs/{logId}            ← Auditoria
│       └── { timestamp, action, userId, oldValues, newValues }
│
└── 📁 users/{uid}                       ← Perfil usuário
    ├── 🔹 email: "user@email.com"
    ├── 🔹 name: "João"
    ├── 🔹 franchiseId: "franchise_xyz"
    ├── 🔹 role: 'manager'
    └── 🔹 permissions: ['create_order', 'view_audit']
```

---

## STACK TÉCNICO POR CAMADA

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND (User Interface)                                        │
├─────────────────────────────────────────────────────────────────┤
│ • React 18.3 + TypeScript                                        │
│ • Vite (build tool)                                              │
│ • TailwindCSS + Radix UI (components)                            │
│ • React Router (navigation)                                      │
│ • React Query (data fetching)                                    │
│ • Firebase SDK (realtime listeners)                              │
│ • Capacitor (bridge nativo)                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND (Serverless)                                             │
├─────────────────────────────────────────────────────────────────┤
│ • Node.js 20+                                                    │
│ • Firebase Cloud Functions                                       │
│ • TypeScript                                                     │
│ • Express.js (HTTP endpoints)                                    │
│ • Firestore Admin SDK                                            │
│ • API clients: PagBank, MercadoPago, Stripe                     │
│ • Scheduled jobs (Cloud Scheduler)                               │
│ • Triggers (Firestore, Pub/Sub)                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ DATA LAYER                                                        │
├─────────────────────────────────────────────────────────────────┤
│ • Firestore (NoSQL, real-time, indexed queries)                 │
│ • Firebase Storage (images, media)                               │
│ • Firebase Authentication (Google, email/password)               │
│ • IndexedDB (local cache on tablet)                              │
│ • localStorage/sessionStorage (preferences, tokens)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ EXTERNAL INTEGRATIONS                                            │
├─────────────────────────────────────────────────────────────────┤
│ • PagBank API + PlugPag SDK (payment terminals)                 │
│ • MercadoPago API (PIX, cartão)                                  │
│ • Stripe API (billing)                                           │
│ • OpenWeatherMap API (clima para forecast)                       │
│ • SMTP/Gmail (email)                                             │
│ • Google Play Store (Android distribution)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ HARDWARE / MOBILE                                                 │
├─────────────────────────────────────────────────────────────────┤
│ • Android 15 (Black Shark BSM1 tablet)                           │
│ • Java/Kotlin (native plugins)                                   │
│ • Bluetooth Classic (Terminal PlugPag)                           │
│ • BLE (ESP32 communication)                                      │
│ • USB Serial (ESP32 communication)                               │
│ • WiFi (ESP32 communication)                                     │
│ • GPIO (relés, solenóides)                                       │
│ • Location Services (GPS/geotracking)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ EMBEDDED SYSTEMS                                                  │
├─────────────────────────────────────────────────────────────────┤
│ • ESP32 Microcontroller                                          │
│ • Arduino IDE / C++                                              │
│ • JSON protocol (serial communication)                           │
│ • GPIO control (solenóides, bombas)                              │
│ • Sensors (flow meter, pressure, etc)                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## SEGURANÇA & ARQUITETURA

```
┌────────────────────────────────────────────────────┐
│ CAMADAS DE SEGURANÇA                               │
├────────────────────────────────────────────────────┤
│                                                    │
│ 1️⃣  AUTENTICAÇÃO (Firebase Auth)                  │
│    └─ Email/Password login                        │
│    └─ Custom claims em token JWT                  │
│                                                    │
│ 2️⃣  AUTORIZAÇÃO (Firestore Rules + Claims)        │
│    └─ Row-level access control                    │
│    └─ Role-based permissions                      │
│    └─ Tenant isolation (franchiseId)              │
│                                                    │
│ 3️⃣  DADOS SENSÍVEIS (Encryption + Masking)        │
│    └─ PAN/CVV nunca armazenados (PCI-DSS)        │
│    └─ CardLastDigits masked (****1234)            │
│    └─ HolderName masked                           │
│    └─ Tokens em env vars (não no código)          │
│                                                    │
│ 4️⃣  COMUNICAÇÃO (HTTPS + TLS)                     │
│    └─ Todos os endpoints HTTPS                    │
│    └─ BLE encryption (Bluetooth)                  │
│    └─ Webhook signature verification              │
│                                                    │
│ 5️⃣  AUDITORIA (Firestore Audit Logs)             │
│    └─ Todas ações logged (create/update/delete)   │
│    └─ Rastreabilidade completa                    │
│    └─ Timestamp + userId + action                 │
│                                                    │
│ 6️⃣  ISOLAMENTO DE TENANT (Multi-tenant)          │
│    └─ franchiseId em todos os dados               │
│    └─ Path resolver garante scope                 │
│    └─ Claims validam acesso                       │
│                                                    │
└────────────────────────────────────────────────────┘

Compliance:
✓ PCI-DSS (pagamento seguro)
✓ GDPR (privacidade dados)
✓ Multi-tenant isolation
✓ Role-based access control
```

---

## DEPLOYMENT FLOW

```
GitHub Repository
    │
    ├─► KIOSK WEB + ADMIN        ├─► CLOUD FUNCTIONS   ├─► ANDROID
    │   (npm run build)          │   (npm run build)    │   (gradle build)
    │   (firebase deploy)        │   (firebase deploy)  │   (apk/aab)
    │                            │                      │
    ▼                            ▼                      ▼
Firebase Hosting          Firebase Functions       Google Play Store
(SPA)                    (serverless APIs)         (Mobile app)
    │                            │                      │
    └────────────┬───────────────┴──────────┬───────────┘
                 │                          │
        ┌────────▼──────────┐      ┌───────▼────────┐
        │ Firestore         │      │ End Users      │
        │ (Real-time DB)    │      │                │
        │ Storage (media)   │      │ • Web browser  │
        │ Auth              │      │ • Mobile app   │
        │                   │      │ • Tablets      │
        └───────────────────┘      │ • Admin panel  │
                                   │                │
                                   └────────────────┘
```

---

## QUANDO USAR CADA DOCUMENTAÇÃO

| Você quer... | Leia... |
|------------|---------|
| **Entender como todo o sistema funciona** | `ARCHITECTURE_MAPPING.md` |
| **Encontrar arquivo/serviço rápido** | `QUICK_REFERENCE.md` |
| **Ver diagrama visual alto nível** | `SYSTEM_OVERVIEW.md` (este arquivo) |
| **Copiar/colar comandos** | `QUICK_REFERENCE.md` #10 |
| **Debugar problema** | `QUICK_REFERENCE.md` #11 |
| **Entender fluxo pagamento** | `ARCHITECTURE_MAPPING.md` #4 |
| **Entender ESP32** | `ARCHITECTURE_MAPPING.md` #3.3 |
| **Entender banco de dados** | `ARCHITECTURE_MAPPING.md` #5 |

---

## RESUMO: STACK RESUMIDO

```
┌──────────────────────────────────────────────────────┐
│ O QUE É OPEN KIOSK?                                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Sistema de quiosque inteligente para venda de       │
│ bebidas com:                                         │
│                                                      │
│ ✓ Catálogo em tempo real (Firestore)               │
│ ✓ Pagamento card-present (Terminal PlugPag)        │
│ ✓ PIX QR Code dinâmico                             │
│ ✓ Dispensação automática (ESP32 + solenóides)      │
│ ✓ Admin web para gerenciar franquias/lojas         │
│ ✓ Analytics em tempo real (Dashboard)              │
│ ✓ Auditoria completa (Firestore logs)              │
│ ✓ Multi-tenant (múltiplas franquias)               │
│                                                      │
│ USUÁRIOS:                                            │
│ • Clientes: veem vitrine, pagam, retiram bebida    │
│ • Franquiados: gerenciam lojas e equipe            │
│ • Superadmins: veem relatórios consolidados        │
│                                                      │
│ TECNOLOGIA:                                          │
│ • Frontend: React 18 + TypeScript + TailwindCSS   │
│ • Backend: Node.js + Firebase Cloud Functions     │
│ • Mobile: Android Capacitor (WebView hybrid)      │
│ • Hardware: ESP32 + Terminal PlugPag (Bluetooth)  │
│ • Database: Firestore (NoSQL, real-time)          │
│ • Payment: PagBank + MercadoPago APIs             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

**Documentação completa gerada.** Próximos passos:

1. Ler `QUICK_REFERENCE.md` para familiarizar com arquivos principais
2. Ler `ARCHITECTURE_MAPPING.md` para entender fluxos em profundidade
3. Rodar localmente seguindo `QUICK_REFERENCE.md` #8 (Checklist)
4. Explorar código: `src/` (Kiosk) → `admin/src/` (Admin) → `functions/src/` (Backend)
