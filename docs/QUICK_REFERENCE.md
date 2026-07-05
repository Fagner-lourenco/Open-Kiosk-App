# Open Kiosk App - Quick Reference Guide

**Para:** Entender a aplicação rapidamente  
**Versão:** 1.1.0  
**Data:** 2025-02-27

---

## 1. O QUE VOCÊ TEM?

### Dois Apps Web + Backend + Hardware

```
┌─────────────────────────────────────────┐
│ KIOSK APP (src/)                        │
│ • Vitrine de bebidas (Shop)             │
│ • Carrinho + Checkout                   │
│ • Pagamento (PlugPag terminal)          │
│ • Controle ESP32 (dispensação)          │
│ • Roda em tablet Android via Capacitor  │
│ ────────────────────────────────────────│
│ Dev: npm run dev (porta 8080)           │
│ Build: npm run build + cap sync android │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ADMIN APP (admin/src/)                  │
│ • Dashboard vendas                      │
│ • Gerenciamento lojas/equipe            │
│ • Relatórios e auditoria                │
│ • Configuração de franquias             │
│ ────────────────────────────────────────│
│ Dev: cd admin && npm run dev (5174)     │
│ Deploy: Vercel ou Firebase Hosting      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ CLOUD FUNCTIONS (functions/src/)        │
│ • Processamento pagamentos (PagBank)    │
│ • Webhooks Stripe/MercadoPago           │
│ • Agregação de métricas                 │
│ • Gestão de permissões (claims)         │
│ • Notifications (FCM)                   │
│ ────────────────────────────────────────│
│ Deploy: firebase deploy --only functions│
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ESP32 FIRMWARE (firmware/)              │
│ • Controla torneiras/bombas             │
│ • Comunica via BLE/USB/WiFi             │
│ • Lê sensores                           │
└─────────────────────────────────────────┘
```

---

## 2. ONDE ESTÁ CADA COISA?

### Páginas do Kiosk (`src/pages/`)

| Página | Arquivo | O que faz |
|--------|---------|-----------|
| **Vitrine** | `Shop.tsx` | Exibe produtos, carrinho, tela ociosa |
| **Checkout** | `Checkout.tsx` | Pagamento (PlugPag/PIX) + dispensação |
| **Login** | `LoginPage.tsx` | Autenticação Firebase |
| **Seleção loja** | `StoreSelectPage.tsx` | Escolhe qual loja operar |
| **Admin local** | `Admin.tsx` | Painel para gerente da loja |
| **Aceitar convite** | `AcceptInvitePage.tsx` | Link email novo usuário |

### Serviços críticos (`src/services/`)

| Serviço | Arquivo | Responsabilidade |
|---------|---------|------------------|
| **Firebase** | `firebase.ts` | Auth + Firestore queries |
| **Pagamento** | `plugpagPaymentService.ts` | Terminal PlugPag (PagBank) |
| **ESP32** | `esp32CommunicationService.ts` | Conexão BLE/USB/WiFi |
| **Pedidos** | `salesService.ts` | CRUD orders + status |
| **Dispensação** | `dispenserService.ts` | Controle de torneiras |
| **Cache** | `cacheService.ts` | IndexedDB local |

### Componentes principais (`src/components/`)

| Componente | Arquivo | Renderiza |
|------------|---------|-----------|
| **Carrinho** | `Cart.tsx` | Modal carrinho + qtd/preço |
| **Card bebida** | `DrinkCard.tsx` | Produto com imagem/preço |
| **Quick checkout** | `DrinkQuickCheckoutModal.tsx` | Compra rápida 1 item |
| **Tela de retirada** | `DrinkPickupScreen.tsx` | Aguarda cliente pegar item |
| **Teclado** | `OnScreenKeyboard.tsx` | Input sem teclado físico |

### Estado global (`src/context/`)

| Context | Arquivo | Gerencia |
|---------|---------|----------|
| **Auth** | `AuthContext.tsx` | Usuário logado + token |
| **ESP32** | `ESP32Context.tsx` | Status conexão hardware |
| **Pagamento** | `PaymentGatewayContext.tsx` | Config gateway (PagBank vs MercadoPago) |
| **Loja** | `StoreContext.tsx` | Loja atual + config |
| **Franquia** | `FranchiseContext.tsx` | Franquia atual |

---

## 3. COMO OS FLUXOS FUNCIONAM?

### Fluxo 1: Login → Operação

```
Usuário digita email/senha
    ↓
authService.signInWithEmailAndPassword()
    ↓
Firebase Auth valida
    ↓
useAuth() + useStoreSettings() carregam dados
    ↓
Redireciona /shop (Kiosk) ou /dashboard (Admin)
    ↓
authService.getCurrentUser() retorna user object
```

**Arquivos:** `LoginPage.tsx` → `AuthContext.tsx` → `firebase.ts`

---

### Fluxo 2: Comprar bebida (Kiosk)

```
1. USER: Clica em DrinkCard (produto)
   └─ setSelectedDrink(product)

2. UI: Abre DrinkQuickCheckoutModal
   └─ Mostra produto + tamanho/preço

3. USER: Clica "Comprar agora"
   └─ Cart.addItem(product, size, quantity)

4. BACKEND: functions/src/payments/createPayment() callable
   └─ Cria document em /franchises/{id}/stores/{id}/payments

5. UI: Mostra PaymentFlow
   └─ Terminal PlugPag aguarda cartão
   └─ QR code PIX exibido em tablet + terminal

6. USUÁRIO: Insere cartão OU escaneia QR
   └─ plugpagPaymentService.doPayment()
   └─ Terminal processa transação

7. WEBHOOK: PagBank notifica backend
   └─ pagbankWebhook() atualiza payment status → 'approved'

8. FIRESTORE LISTENER: Detecta status 'approved'
   └─ Atualiza ordem: status = 'paid'
   └─ UI avança para DrinkPickupScreen

9. BACKEND: esp32CommunicationService envia comando
   └─ { "action": "dispense", "volumes": { "tap_0": 500 } }

10. HARDWARE: ESP32 dispensa bebida
    └─ Retorna { "status": "success", "dispensed": { "tap_0": 495 } }

11. FIRESTORE: Update order
    └─ status = 'dispensed'
    └─ dispenseStatus = 'dispensed'

12. UI: DrinkPickupScreen mostra "Retirada com sucesso"
```

**Arquivos:** `Shop.tsx` → `Cart.tsx` → `Checkout.tsx` → `PaymentFlow.tsx` → `plugpagPaymentService.ts` → `dispenserService.ts` → `esp32CommunicationService.ts`

---

### Fluxo 3: Relatório Admin

```
1. Admin: Acessa /dashboard
   └─ useQuery('dashboardMetrics')

2. BACKEND: aggregateDailySales() callable
   └─ Lee orders + payments
   └─ Agrega por produto, horário, loja

3. FIRESTORE: Retorna aggregated data
   └─ Gráficos renderizam

4. Admin: Filtra por período/loja
   └─ useStoreSettings() atualiza scope
   └─ Queries são refetch automático
```

**Arquivos:** `admin/src/pages/dashboard/` → `analyticsService.ts` → `functions/src/analytics/`

---

## 4. BANCO DE DADOS (Firestore)

### Estrutura simplificada

```
franchises/
├── {franchiseId}/
│   ├── stores/
│   │   └── {storeId}/
│   │       ├── products/      ← Bebidas
│   │       ├── orders/        ← Pedidos
│   │       ├── payments/      ← Transações
│   │       └── devices/       ← Tablets conectados
│   │
│   ├── members/               ← Equipe
│   ├── billingEvents/
│   └── auditLogs/             ← Histórico ações

users/
└── {uid}/                      ← Perfil usuário
```

### Como salvar dados

```typescript
// CRIAR ordem
await db.collection('franchises').doc(franchiseId)
  .collection('stores').doc(storeId)
  .collection('orders').add({
    items: [{ product, size, quantity }],
    totalAmount: 2500,
    status: 'draft',
    createdAt: serverTimestamp()
  })

// ATUALIZAR status
await db.collection(...).doc(orderId).update({
  status: 'paid',
  paymentId: paymentDocId,
  paidAt: serverTimestamp()
})

// LER produtos
const snapshot = await db.collection(...)
  .collection('products')
  .where('active', '==', true)
  .get()
```

**Arquivo:** `src/lib/pathResolver.ts` — helper para construir caminhos Firestore

---

## 5. PAGAMENTO - ATALHO

### PlugPag (PagBank)

**Como funciona:**
1. Terminal conecta via Bluetooth ao tablet
2. Usuário insere cartão OU escaneia PIX
3. SDK nativo (Java) comunica com terminal
4. Retorna resultado: `{ status: 'approved', transactionId: 'xxx' }`
5. Webhook PagBank notifica backend → atualiza Firestore

**Arquivos:**
- `android/app/src/main/java/.../PlugPagTerminalPlugin.kt` — plugin nativo
- `src/services/plugpagPaymentService.ts` — orquestração
- `src/hooks/usePlugPagAutoConnect.ts` — auto-conecta terminal ao startup
- `functions/src/payments/pagbankWebhook.ts` — processa webhook

**Debugging:**
```typescript
// Ver estado do terminal
const { status: esp32Status } = useESP32();
console.log(esp32Status);

// Força reconexão
await plugpagService.disconnect();
await plugpagService.connect();
```

---

## 6. HARDWARE (ESP32)

### Conexão: BLE, USB ou WiFi

```
Tablet (Kiosk App)
     ↕ (Bluetooth LE, USB Serial, WiFi)
ESP32 Microcontroller
     ↕ (GPIO pins)
Relés + Solenóides + Bombas
```

### Comando de dispensação

**Enviado:**
```json
{
  "action": "dispense",
  "volumes": { "tap_0": 500, "tap_1": 250 },
  "timeout": 30
}
```

**Recebido:**
```json
{
  "status": "success",
  "dispensed": { "tap_0": 495, "tap_1": 248 },
  "duration_ms": 8500
}
```

**Arquivos:**
- `src/services/esp32CommunicationService.ts` — gerencia conexão
- `src/services/esp32SerialService.ts` — protocolo JSON/serial
- `firmware/firmware.ino` — código ESP32

---

## 7. INTEGRAÇÕES EXTERNAS

### PagBank
- **Credencial:** Auth token em `functions/.env` (env var `PAGBANK_AUTH_TOKEN`)
- **Webhook:** `https://<region>-<project>.cloudfunctions.net/pagbankWebhook`
- **Documentação:** Manual SDK em `/plugpag-master-4.x/`

### MercadoPago
- **Credencial:** Access token em env `MERCADOPAGO_ACCESS_TOKEN`
- **Webhook:** `https://<project>.cloudfunctions.net/mercadopagoWebhook`

### Firebase
- **Credencial:** `.env` com `VITE_FIREBASE_*` vars
- **Admin SDK:** `functions/.env` com service account JSON

### Stripe
- **Webhook:** Para billing empresarial
- **Credencial:** `STRIPE_SECRET_KEY` em env

---

## 8. CHECKLIST: RODAR LOCALMENTE

### Kiosk Web

```bash
# 1. Instalar dependências
npm install

# 2. Criar .env local (copiar .env.example)
cp public/config/.env.example public/config/.env.local.json

# 3. Preencher vars (Firebase, PagBank token, etc)
# Editar public/config/.env.local.json

# 4. Rodar dev server
npm run dev

# 5. Acessar http://localhost:8080
```

### Admin App

```bash
# 1. Entrar pasta admin
cd admin

# 2. Instalar deps
npm install

# 3. Copiar .env
cp .env.example .env.local

# 4. Dev server
npm run dev

# 5. Acessar http://localhost:5174
```

### Cloud Functions

```bash
# 1. Entrar pasta functions
cd functions

# 2. Instalar deps
npm install

# 3. Rodar emulator (local)
npm run serve

# 4. Logs
firebase functions:log
```

### Android Build

```bash
# 1. Build React
npm run build

# 2. Sync Capacitor
npx cap sync android

# 3. Abrir Android Studio
npx cap open android

# 4. Build → APK
  ou
  ./gradlew assembleDebug

# 5. Instalar em device
adb install -r android/app/build/outputs/apk/debug/*.apk
```

---

## 9. VARIÁVEIS DE AMBIENTE

### Kiosk App (`public/config/.env.local.json`)

```json
{
  "firebaseApiKey": "...",
  "firebaseAuthDomain": "...",
  "firebaseProjectId": "...",
  "firebaseStorageBucket": "...",
  "firebaseMessagingSenderId": "...",
  "firebaseAppId": "...",
  "appVersion": "1.1.0",
  "debug": false,
  "rootPin": "1234",
  "pagbankAuthToken": "..."
}
```

### Admin App (`admin/.env.local`)

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
VITE_USE_FIREBASE_EMULATORS=false
VITE_ENABLE_PERMISSION_FILTERED_NAV=true
```

### Functions (`functions/.env`)

```
PAGBANK_AUTH_TOKEN=...
MERCADOPAGO_ACCESS_TOKEN=...
STRIPE_SECRET_KEY=...
FIREBASE_PROJECT_ID=...
SMTP_USER=...
SMTP_PASS=...
```

---

## 10. COMANDOS ÚTEIS

```bash
# Lint código
npm run lint                   # Kiosk
cd admin && npm run lint       # Admin
cd functions && npm run lint   # Functions

# Testes
npm run test                   # Kiosk + Admin
cd functions && npm run test   # Functions

# Build
npm run build                  # Kiosk
npm run build:admin            # Admin
npm run build:functions        # Functions

# Deploy Firebase
firebase deploy --only hosting                    # Web
firebase deploy --only functions                 # Functions
firebase deploy --only firestore:rules            # Regras

# Deploy Vercel (Admin)
cd admin && vercel deploy

# Type check
npm run typecheck              # Kiosk
npm run typecheck:admin        # Admin
npm run typecheck:functions    # Functions

# Emuladores Firebase
firebase emulators:start       # Local testing
```

---

## 11. TROUBLESHOOTING RÁPIDO

### "Erro ao conectar ao terminal PlugPag"
→ Verificar se Bluetooth está ON no tablet
→ Verificar `allowDeveloperMode()` em `kioskModeService.ts`
→ Verificar auth token em `functions/.env`

### "Pedido não dispensa após pagamento"
→ Verificar conexão ESP32 (`useESP32().status`)
→ Verificar logs do ESP32 (console do Arduino)
→ Verificar Firestore: `orders/{orderId}.dispenseStatus`

### "Erro de permissão no Firestore"
→ Verificar `firestore.rules` (regras de segurança)
→ Verificar custom claims do user (`idToken.claims`)
→ Verificar caminho Firestore correto em `pathResolver.ts`

### "Admin não carrega dados"
→ Verificar permission check em `Admin.tsx`
→ Verificar claims do user (deve ter `franchiseAdmin` ou `manager`)
→ Verificar Firestore índices criados (`firestore.indexes.json`)

---

## 12. ESTRUTURA DE PASTAS RESUMIDA

```
src/                          Kiosk App (React)
├── pages/                    Rotas (Shop, Checkout, etc)
├── services/                 30+ serviços (Firebase, PlugPag, ESP32)
├── context/                  Estado global (Auth, ESP32, Payment)
├── hooks/                    React hooks customizados
├── components/               100+ componentes
├── types/                    TypeScript types
├── utils/                    Funções puras
└── i18n/                     Multi-idioma

admin/src/                    Admin App (React)
├── pages/                    Dashboard, Reports, etc
├── services/                 Serviços admin
└── ...                       Mesma estrutura que Kiosk

functions/src/               Cloud Functions (Node.js)
├── payments/                PagBank, MercadoPago, Stripe
├── auth/                    Firebase Auth triggers
├── erp/                      ERP (torneiras, barris)
├── analytics/               Métricas
├── ranking/                 Gamificação
└── ...                      Mais handlers

android/                     Native Android (Capacitor)
├── app/src/main/
│   ├── java/.../            Plugins nativos (PlugPag, Bluetooth)
│   └── AndroidManifest.xml
└── ...

shared/                       Tipos compartilhados
└── types/                    Types usados em múltiplos apps

firmware/                    ESP32 Firmware
└── firmware.ino             Código Arduino
```

---

## 13. RESUMO: O CAMINHO DE UM PRODUTO

```
1. Admin: Cria produto em Firestore (/stores/{storeId}/products)
2. Kiosk: Carrega via useFirebaseProducts()
3. Shop: Renderiza Card produto
4. User: Clica → Cart.addItem()
5. Cart: Mostra carrinho + total
6. Checkout: User clica "Pagar"
7. PaymentFlow: Terminal aguarda cartão
8. PlugPag SDK: Processa pagamento
9. Webhook: PagBank notifica backend
10. Firestore: Payment → 'approved'
11. Listener: Detecta mudança → atualiza UI
12. ESP32: Recebe comando dispense
13. Hardware: Dispensa bebida
14. ESP32: Retorna volumes reais
15. Firestore: Order → 'dispensed'
16. UI: DrinkPickupScreen → "Retirada com sucesso"
17. 20s depois: Volta a Shop (atrai idle timeout)
```

---

**FIM DO QUICK REFERENCE**

Para mais detalhes, ver: `docs/ARCHITECTURE_MAPPING.md`
