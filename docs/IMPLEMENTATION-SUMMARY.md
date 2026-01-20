# Implementação Multi-Franchise - Resumo

## Data: Implementação Completa

---

## ✅ O que foi implementado

### 1. Tipos Unificados (`shared/types/`)

- **[roles.ts](shared/types/roles.ts)**: 
  - `UserRole`: owner, admin, manager, operator, technician, viewer
  - `ROLE_HIERARCHY`: níveis numéricos para comparação
  - `ROLE_LABELS` e `ROLE_DESCRIPTIONS`: labels pt-BR
  - Helpers: `isRoleAtLeast()`, `isRoleAbove()`, `getAssignableRoles()`

- **[permissions.ts](shared/types/permissions.ts)**:
  - `Permission`: 35 permissões granulares (resource:action)
  - `ROLE_PERMISSIONS`: mapeamento role → permissões
  - Helpers: `roleHasPermission()`, `roleHasAllPermissions()`, `roleHasAnyPermission()`
  - `PERMISSION_LABELS`: labels pt-BR

- **[index.ts](shared/types/index.ts)**: barrel export

### 2. Cloud Functions (`functions/`)

Estrutura completa de Cloud Functions com:

- **Auth**:
  - [onCreate.ts](functions/src/auth/onCreate.ts): cria franquia e usuário no primeiro login
  - [setCustomClaims.ts](functions/src/auth/setCustomClaims.ts): atualiza claims de usuário

- **Invitations**:
  - [sendEmail.ts](functions/src/invitations/sendEmail.ts): envia email de convite via nodemailer
  - [accept.ts](functions/src/invitations/accept.ts): aceita convite e atualiza claims

- **Billing** (Stripe):
  - [stripeWebhook.ts](functions/src/billing/stripeWebhook.ts): webhook para eventos Stripe
  - [createCheckout.ts](functions/src/billing/createCheckout.ts): cria sessão de checkout

### 3. Sistema de Billing (Admin)

- **[billing.ts](admin/src/types/billing.ts)**: 
  - `BillingPlan`, `BillingStatus`, `FranchiseBilling`
  - `PLAN_DETAILS`: detalhes de cada plano com limites e preços

- **[billingService.ts](admin/src/services/billingService.ts)**:
  - `getFranchiseBilling()`, `getBillingHistory()`
  - `createCheckoutSession()`, `openBillingPortal()`
  - Helpers para verificação de planos e status

- **[BillingPage.tsx](admin/src/pages/billing/BillingPage.tsx)**:
  - UI completa para gerenciamento de plano
  - Seletor mensal/anual
  - Cards de planos com upgrade
  - Histórico de pagamentos

### 4. Dashboard Overview

- **[FranchiseOverview.tsx](admin/src/pages/dashboard/FranchiseOverview.tsx)**:
  - Métricas consolidadas de todas as lojas
  - Receita/pedidos de hoje e do mês
  - Contagem de lojas e usuários
  - Alertas e atividades recentes
  - Modo compacto e completo

### 5. Correções

- **[franchise.ts](admin/src/types/franchise.ts)**: corrigido typo `oderId` → `orderId`
- **[pathResolver.ts](admin/src/lib/pathResolver.ts)**: `invitationsPath()` agora usa coleção global
- **[usePermissions.ts](src/hooks/usePermissions.ts)**: corrigido acesso ao role via `customClaims`
- **[App.tsx](admin/src/App.tsx)**: adicionada rota `/billing`

### 6. Componentes UI

- **[skeleton.tsx](admin/src/components/ui/skeleton.tsx)**: componente de loading
- **[utils.ts](admin/src/lib/utils.ts)**: adicionado `formatCurrency()`

---

## 🔧 Próximos Passos para Deploy

### Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### Configurar Stripe

```bash
firebase functions:config:set stripe.secret_key="sk_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."
firebase functions:config:set stripe.price_starter_monthly="price_..."
# etc.
```

### Configurar SMTP (para emails)

```bash
firebase functions:config:set smtp.host="smtp.gmail.com"
firebase functions:config:set smtp.port="587"
firebase functions:config:set smtp.user="email@..."
firebase functions:config:set smtp.pass="password"
```

---

## 📊 Status da Implementação

| Componente | Status | Notas |
|------------|--------|-------|
| Tipos Unificados | ✅ 100% | Pronto para uso |
| Cloud Functions | ✅ 100% | Requer `npm install` e config |
| Billing Admin | ✅ 100% | Integrado com Stripe |
| FranchiseOverview | ✅ 100% | Componente dashboard |
| Correções | ✅ 100% | Typos e paths corrigidos |

---

## ⚠️ Compatibilidade

### Garantias Mantidas

1. **Kiosk em Produção**: Nenhuma alteração quebra funcionalidades existentes
2. **Fluxo de Vendas**: Intacto
3. **ESP32 Integration**: Intacta
4. **Modo Offline/PIN**: Intacto
5. **Sync**: Intacto

### Adições Não-Disruptivas

- Todos os novos arquivos são **adicionais**
- Tipos em `shared/` são **novos** (não substituem existentes)
- Cloud Functions são **novas** (não havia nenhuma antes)
- Sistema de Billing é **novo** (página adicional)

---

## 🗂️ Arquivos Criados

```
shared/
└── types/
    ├── roles.ts
    ├── permissions.ts
    └── index.ts

functions/
├── .gitignore
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── auth/
    │   ├── onCreate.ts
    │   └── setCustomClaims.ts
    ├── invitations/
    │   ├── sendEmail.ts
    │   └── accept.ts
    └── billing/
        ├── stripeWebhook.ts
        └── createCheckout.ts

admin/src/
├── types/billing.ts
├── services/billingService.ts
├── pages/billing/BillingPage.tsx
├── pages/dashboard/FranchiseOverview.tsx
└── components/ui/skeleton.tsx
```

## 🗂️ Arquivos Modificados

```
admin/src/types/franchise.ts        # Fix: oderId → orderId
admin/src/lib/pathResolver.ts       # Fix: invitationsPath global
admin/src/lib/utils.ts              # Add: formatCurrency
admin/src/types/index.ts            # Add: billing export
admin/src/services/index.ts         # Add: billingService export
admin/src/pages/index.ts            # Add: BillingPage export
admin/src/pages/dashboard/index.ts  # Add: FranchiseOverview export
admin/src/components/ui/index.ts    # Add: skeleton export
admin/src/App.tsx                   # Add: /billing route
src/hooks/usePermissions.ts         # Fix: customClaims.role access
```
