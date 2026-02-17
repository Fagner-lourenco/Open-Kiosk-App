# Auditoria de Métricas, Relatórios e Dashboard

**Data:** 2026-02-16  
**Escopo:** Kiosk (`src/`), Admin (`admin/src/`), Functions (`functions/src/`)

---

## 1. Arquivos Relacionados a Métricas/Relatórios

### Kiosk (src/)
| Arquivo | Função |
|---------|--------|
| `src/services/salesService.ts` | Escrita de pedidos no Firestore |
| `src/hooks/useReports.tsx` | Hook de relatórios para UI do kiosk |
| `src/components/Reports.tsx` | Tela de relatórios do kiosk |
| `src/components/AdminOverview.tsx` | Overview do admin embutido no kiosk |
| `src/types/sales.ts` | Tipos de venda (SaleTimingData, etc.) |
| `src/services/firebase.ts` | getStoreCollection, path resolution |

### Admin (admin/src/)
| Arquivo | Função |
|---------|--------|
| `admin/src/services/reportService.ts` | Serviço central de relatórios (getSalesReport, getStoreReport, getProductReport) |
| `admin/src/types/reports.ts` | Tipos de relatório |
| `admin/src/pages/dashboard/DashboardPage.tsx` | Dashboard principal |
| `admin/src/pages/dashboard/FranchiseOverview.tsx` | Visão geral da franquia com métricas |
| `admin/src/pages/reports/ReportsPage.tsx` | Página de relatórios completa |
| `admin/src/pages/superadmin/SuperAdminDashboard.tsx` | Dashboard do super admin |
| `admin/src/pages/stores/StoreOverviewPage.tsx` | Overview da loja (sem métricas) |
| `admin/src/components/dashboard/KPICards.tsx` | Cards de KPI reutilizáveis |
| `admin/src/components/store/StoreReportsTab.tsx` | Aba de relatórios por loja |
| `admin/src/components/store/StoreOrdersTab.tsx` | Aba de pedidos por loja |
| `admin/src/components/orders/OrderStats.tsx` | Estatísticas dos pedidos |
| `admin/src/components/store/finance/FinanceOverviewTab.tsx` | Dashboard financeiro |
| `admin/src/hooks/useTvDashboard.ts` | Dashboard TV |
| `admin/src/lib/pathResolver.ts` | Resolução de paths do Firestore |

### Functions (functions/src/)
| Arquivo | Função |
|---------|--------|
| `functions/src/analytics/aggOrders.ts` | Trigger onCreate/onUpdate que materializa métricas (metrics/current) |
| `functions/src/analytics/aggregateDailySales.ts` | Cron job noturno que agrega dailyStats |
| `functions/src/analytics/getMetricsAdmin.ts` | Callable function para métricas no admin |

---

## 2. Fluxo de Dados (Diagrama)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          ESCRITA DE DADOS (KIOSK)                           │
│                                                                              │
│  salesService.recordSaleAndUpdateStock()                                     │
│    └─> Escreve em: franchises/{fid}/stores/{sid}/orders/{orderId}            │
│        Campos: timestamp (Date JS), createdAt (serverTimestamp),             │
│                status='paid_pending_dispense', paymentStatus='paid',         │
│                total, items[], paymentMethod, etc.                            │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    MATERIALIZAÇÃO (CLOUD FUNCTIONS)                           │
│                                                                              │
│  ┌─ aggOrders.onOrderCreated (trigger em tempo real) ─────────────────────┐  │
│  │  Atualiza com FieldValue.increment():                                   │  │
│  │   ├── analytics/daily/{YYYY-MM-DD}                                      │  │
│  │   ├── analytics/hourly/{YYYY-MM-DD-HH}                                 │  │
│  │   ├── franchises/{fid}/stores/{sid}/metrics/current                     │  │
│  │   └── franchises/{fid}/metrics/current                                  │  │
│  │  Campos: revenue, orders, paidOrders, pendingOrders, cancelledOrders    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ aggregateDailySales (cron 02:00 BRT) ─────────────────────────────────┐  │
│  │  Lê orders do dia anterior e grava:                                     │  │
│  │   └── franchises/{fid}/stores/{sid}/dailyStats/{YYYY-MM-DD}             │  │
│  │  Campos: totalOrders, completedOrders, cancelledOrders, pendingOrders,  │  │
│  │           totalRevenue, avgTicket, paymentMethods, hourlyDistribution,  │  │
│  │           topProducts                                                   │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         LEITURA DE DADOS (ADMIN)                             │
│                                                                              │
│  DashboardPage          → query direta em orders (sem filtro de status)      │
│  FranchiseOverview      → query direta em orders (sem filtro de status)      │
│  ReportsPage            → query direta em orders (sem filtro de status)      │
│  StoreReportsTab        → query direta em orders + filtro local de status    │
│  StoreOrdersTab         → query direta em orders + filtro local de status    │
│  reportService          → dailyStats (materializado) → fallback p/ orders   │
│  getMetricsAdmin (CF)   → dailyStats ou metrics/current                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Bugs e Problemas Encontrados

### BUG #1 — CRÍTICO: Receita inflada no DashboardPage, FranchiseOverview e ReportsPage (sem filtro de status)

**Arquivos:**
- `admin/src/pages/dashboard/DashboardPage.tsx` (L86-91)
- `admin/src/pages/dashboard/FranchiseOverview.tsx` (L147-153)
- `admin/src/pages/reports/ReportsPage.tsx` (L175-183)

**Descrição:**  
Estes três componentes fazem queries diretas nos pedidos e somam `order.total` de **todos** os pedidos, sem filtrar por `status` ou `paymentStatus`. Isso significa que pedidos **cancelados**, **pendentes** e **com falha de dispense** são contabilizados na receita.

**Impacto:** Receita total, ticket médio e demais métricas de valor ficam **inflados**.

**Exemplo em DashboardPage (L86-91):**
```tsx
ordersSnapshot.docs.forEach(doc => {
  const order = doc.data();
  totalOrders++;
  totalRevenue += order.total || 0; // ⚠️ Soma TODOS, incluindo cancelados
});
```

**Exemplo em FranchiseOverview (L147-153):**
```tsx
todayOrdersQuery.docs.forEach(doc => {
  const order = doc.data();
  todayOrders++;
  todayRevenue += order.total || 0; // ⚠️ Sem filtro de status
});
```

**Exemplo em ReportsPage (L175-183):**
```tsx
ordersSnapshot.docs.forEach(doc => {
  const order = doc.data() as OrderData;
  // ...
  totalOrders++;
  totalRevenue += order.total || 0; // ⚠️ Sem filtro de status
});
```

**Correção sugerida:**  
Filtrar apenas pedidos pagos/concluídos usando a mesma lógica usada em `StoreReportsTab` e `aggOrders`:
```tsx
const isPaid = (order) => {
  const status = (order.status || '').toLowerCase();
  const paymentStatus = (order.paymentStatus || '').toLowerCase();
  return ['completed', 'paid', 'paid_pending_dispense', 'dispensing'].includes(status)
    && ['paid', 'completed', 'dispensed'].includes(paymentStatus);
};

ordersSnapshot.docs.forEach(doc => {
  const order = doc.data();
  totalOrders++;
  if (isPaid(order)) {
    totalRevenue += order.total || 0;
  }
});
```

---

### BUG #2 — CRÍTICO: Ticket médio calculado com divisor errado (ReportsPage)

**Arquivo:** `admin/src/pages/reports/ReportsPage.tsx` (L242)

**Descrição:**  
O ticket médio é calculado como `totalRevenue / totalOrders` onde `totalOrders` é o número TOTAL de pedidos (incluindo cancelados e pendentes) e `totalRevenue` é a soma de TODOS os totais (sem filtro). A fórmula correta deveria ser `receivedRevenue / paidOrders`.

**Código:**
```tsx
averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
```

**Impacto:** Ticket médio pode estar errado nos dois sentidos — se houver pedidos cancelados de valor zero, o ticket médio diminui artificialmente; se forem contados na receita, infla.

**Correção sugerida:**  
Contar somente pedidos pagos no numerador e no denominador.

---

### BUG #3 — CRÍTICO: Inconsistência de campo `timestamp` vs `createdAt` entre writer e readers

**Escritor (Kiosk):**  
Em `src/services/salesService.ts` (L26, L305-327), cada pedido recebe DOIS campos de data:
- `timestamp: now` — `Date` JavaScript nativa (via `SaleTimingData`)  
- `createdAt: serverTimestamp()` — `FieldValue.serverTimestamp()` do Firebase

**Leitores:**
| Componente | Campo usado na query | Campo usado na query |
|------------|---------------------|---------------------|
| `DashboardPage` (L84) | `timestamp` (orderBy) | ✅ |
| `FranchiseOverview` (L143) | `timestamp` (where >=) | ✅ |
| `ReportsPage` (L172) | `timestamp` (orderBy) | ✅ |
| `StoreReportsTab` (L127) | `timestamp` (where >=) | ✅ |
| `StoreOrdersTab` (L51) | `timestamp` (orderBy) | ✅ |
| `reportService.getSalesReport` (L165) | `createdAt` (where >=) | ⚠️ DIFERENTE |
| `reportService.getStoreReport` (L401) | `createdAt` (where >=) | ⚠️ DIFERENTE |
| `aggregateDailySales` (L118) | `timestamp` (where >=) | ✅ |

**Impacto:**
O `reportService.ts` (usado por `getStoreReport` no comparativo de lojas e `getSalesReport` no fallback materializado) faz query em `createdAt`, enquanto o campo principal indexado nos pedidos é `timestamp`. O `createdAt` é um `serverTimestamp()` e `timestamp` é um `Date JS` — ambos existem mas:
1. A query em `createdAt` pode falhar se o índice composto não existir para esse campo
2. Se o kiosk estiver offline, `createdAt` será `null` até sync, fazendo com que o pedido **não apareça** nessas queries

**Correção sugerida:**  
Uniformizar para usar sempre `timestamp` nas queries, ou garantir que ambos os campos estejam indexados identicamente.

---

### BUG #4 — MODERADO: Ticket médio inconsistente entre aggOrders (metrics/current) e aggregateDailySales (dailyStats)

**Arquivos:**
- `functions/src/analytics/aggOrders.ts` (L103)
- `functions/src/analytics/aggregateDailySales.ts` (L190)

**Descrição:**  
- `aggOrders` calcula o averageTicket como `revenue / orders` (todos os pedidos)
- `aggregateDailySales` calcula o avgTicket como `totalRevenue / completedOrders` (somente pedidos pagos)

Isso gera divergência: o dado em `metrics/current` usa um divisor diferente do dado em `dailyStats`.

**Impacto:** O `getMetricsAdmin` (que lê os `dailyStats`) agrega usando `totalRevenue/totalOrders` (L103), que é inconsistente com a fonte `dailyStats` que salvou `avgTicket = totalRevenue/completedOrders`.

**Correção sugerida:**  
Definir uma única fórmula para ticket médio. A mais correta é `revenue / paidOrders` (somente pedidos efetivamente pagos). Alinhar tanto `aggOrders` quanto `aggregateDailySales`.

---

### BUG #5 — MODERADO: Fuso horário UTC nas queries diárias causa gaps/sobreposições para Brasil (UTC-3)

**Arquivos:**
- `functions/src/analytics/aggregateDailySales.ts` (L112-113)
- `functions/src/analytics/aggOrders.ts` (L53-58)

**Descrição:**

1. Em `aggregateDailySales`, o range do dia é construído em UTC:
   ```ts
   const startOfDay = new Date(`${date}T00:00:00.000Z`);
   const endOfDay = new Date(`${date}T23:59:59.999Z`);
   ```
   Mas o scheduler roda em `America/Sao_Paulo` (UTC-3). Para um pedido feito às 22:30 BRT (01:30 UTC do dia seguinte), ele cai no dia errado no dailyStats.

2. Em `aggOrders`, o `dateKey` usa `toISOString()` que é UTC:
   ```ts
   const date = timestamp?.toDate() || new Date();
   return date.toISOString().split('T')[0]; // UTC!
   ```
   Um pedido das 23h BRT será classificado no dia seguinte UTC.

3. A distribuição horária usa `getUTCHours()` (L160 de `aggregateDailySales`), então o gráfico por hora mostra horários UTC, não BRT.

**Impacto:** Métricas diárias desalinhadas com a realidade operacional do Brasil. Pedidos noturnos caem no dia errado. Gráficos horários mostram horários errados.

**Correção sugerida:**  
Converter para timezone local antes de gerar dateKey:
```ts
function getDateKeyBRT(timestamp: Timestamp | undefined): string {
  const date = timestamp?.toDate() || new Date();
  return date.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}
```

---

### BUG #6 — MODERADO: `pendingOrders` nunca atualizado no `metrics/current` do aggOrders para situação "paid_pending_dispense"

**Arquivo:** `functions/src/analytics/aggOrders.ts` (L107-113)

**Descrição:**  
O kiosk cria pedidos com `status = 'paid_pending_dispense'` e `paymentStatus = 'paid'`. No `aggOrders`:
- `isPaidOrder` retorna `true` (porque 'paid_pending_dispense' está em PAID_ORDER_STATUSES e 'paid' está em PAID_PAYMENT_STATUSES)
- `isPendingStatus` também retorna `true` (porque 'paid_pending_dispense' está em PENDING_ORDER_STATUSES)

Mas na lógica de `isNew`:
```ts
if (isPaidOrder(order)) {
  updates.revenue = increment(order.total || 0);
  updates.paidOrders = increment(1);
} else if (isCancelledStatus(status)) {
  updates.cancelledOrders = increment(1);
} else {
  updates.pendingOrders = increment(1); // Nunca chega aqui para paid_pending_dispense
}
```
O `else` para `pendingOrders` é mutuamente exclusivo com `isPaidOrder`. Então um pedido `paid_pending_dispense` conta como pago mas NUNCA como pendente, mesmo estando em `PENDING_ORDER_STATUSES`.

**Impacto:** O card "Pendentes" no dashboard sempre mostra 0 para pedidos do tipo `paid_pending_dispense` (que é o status padrão do kiosk).

**Correção sugerida:**  
Se "pendente" significa "aguardando dispense", adicionar lógica separada:
```ts
if (isPaidOrder(order)) {
  updates.revenue = increment(order.total || 0);
  updates.paidOrders = increment(1);
  if (isPendingStatus(status)) {
    updates.pendingOrders = increment(1); // Pago mas pendente de dispense
  }
}
```

---

### BUG #7 — MODERADO: DashboardPage conta pedidos antigos como receita (limit 100, sem filtro de data)

**Arquivo:** `admin/src/pages/dashboard/DashboardPage.tsx` (L79-91)

**Descrição:**  
O DashboardPage faz `limit(100)` e `orderBy('timestamp', 'desc')` mas **sem filtro de data**:
```tsx
const ordersSnapshot = await getDocs(
  query(
    collection(db, ...pathSegments),
    orderBy('timestamp', 'desc'),
    limit(100)
  )
);
```
Isso retorna os 100 pedidos mais recentes, que podem abranger semanas/meses. A "Receita" exibida no dashboard é a soma desses 100 pedidos, não a "receita de hoje" ou "do mês".

**Impacto:** O card "Receita" mostra um valor arbitrário dependendo do volume de pedidos, sem relação com um período específico.

**Correção sugerida:**  
Adicionar `where('timestamp', '>=', startOfToday)` ou usar os dados materializados de `metrics/current`.

---

### BUG #8 — MENOR: useReports (kiosk) soma `total || total_amount` misturando schemas

**Arquivo:** `src/hooks/useReports.tsx` (L67, L148, etc.)

**Descrição:**  
O hook usa `sale.total || sale.total_amount || 0` como fallback. Porém, o `salesService` sempre grava `total` (nunca `total_amount`). O campo `total_amount` parece ser de um schema legado. Isso em si não é um bug, mas cria confusão e risco de double-counting se ambos existirem.

**Impacto:** Baixo, mas pode causar confusão na manutenção.

---

### BUG #9 — MENOR: Moeda padrão hardcoded como 'INR' no kiosk

**Arquivo:** `src/hooks/useReports.tsx` (L49, L97, L100)

**Descrição:**  
O fallback de moeda é `'INR'`:
```tsx
currency: salesData[0]?.currency || 'INR'
```
Porém, é um sistema brasileiro. Deveria ser `'BRL'`.

**Impacto:** Se nenhum pedido tiver o campo `currency`, o relatório mostrará "INR" como moeda.

**Correção sugerida:**  
Trocar para `'BRL'`.

---

### BUG #10 — MENOR: `getMetricsAdmin` re-calcula averageTicket com fórmula inconsistente

**Arquivo:** `functions/src/analytics/getMetricsAdmin.ts` (L86-103)

**Descrição:**  
Ao agregar `dailyStats`, o `getMetricsAdmin` lê `data.totalRevenue` e `data.totalOrders` do dailyStats mas:
- `totalRevenue` no dailyStats é a receita de pedidos **pagos** (completedOrders)
- `totalOrders` no dailyStats é o total de **todos** os pedidos

Depois calcula:
```ts
aggregated.averageTicket = aggregated.orders > 0 ? aggregated.revenue / aggregated.orders : 0;
```
Onde `aggregated.orders += data.totalOrders` (todos) e `aggregated.revenue += data.totalRevenue` (só pagos).

**Impacto:** O ticket médio retornado pelo callable é menor do que deveria, pois divide receita-de-pagos pelo total-de-todos.

**Correção sugerida:**  
Usar `aggregated.paidOrders` como divisor em vez de `aggregated.orders`.

---

### BUG #11 — MENOR: StoreReportsTab filtra `status === 'completed'` mas kiosk usa `paid_pending_dispense`

**Arquivo:** `admin/src/components/store/StoreReportsTab.tsx` (L199)

**Descrição:**
```tsx
const completedOrders = orders.filter(o => o.status === 'completed' && o.paymentStatus === 'paid');
```
No kiosk, pedidos são criados com `status = 'paid_pending_dispense'` e só mudam para `'completed'` após confirmação do ESP32. Se o ESP32 não confirmar (falha, timeout), o pedido fica permanentemente como `paid_pending_dispense` e **nunca** aparece nas métricas do StoreReportsTab.

**Impacto:** Receita de pedidos pagos-mas-não-dispensados nunca aparece nessa aba.

**Correção sugerida:**  
Expandir o filtro para incluir os statuses de pago do `aggOrders`:
```tsx
const PAID_STATUSES = ['completed', 'paid', 'paid_pending_dispense', 'dispensing'];
const PAID_PAYMENT_STATUSES = ['paid', 'completed', 'dispensed'];
const completedOrders = orders.filter(o => 
  PAID_STATUSES.includes(o.status) && PAID_PAYMENT_STATUSES.includes(o.paymentStatus)
);
```

---

### BUG #12 — MENOR: StoreOrdersTab igualmente filtra apenas `completed` + `paid`

**Arquivo:** `admin/src/components/store/StoreOrdersTab.tsx` (L99-101, L106-107)

**Descrição:**  
Mesmo problema do BUG #11:
```tsx
revenue: orders
  .filter(o => o.status === 'completed' && o.paymentStatus === 'paid')
  .reduce((sum, o) => sum + (o.total || 0), 0),
```

---

## 4. Schema Mismatches: Writer (Kiosk) vs Reader (Admin/Functions)

| Campo | Writer (salesService) | Reader (Dashboard/Reports) | Reader (aggOrders) | Problema |
|-------|----------------------|---------------------------|-------------------|----------|
| `timestamp` | `Date` JS nativa | ✅ Usado em queries | ✅ Usado para dateKey | OK, Firestore converte |
| `createdAt` | `serverTimestamp()` | ⚠️ `reportService` faz query neste campo | ✅ Backup em aggOrders | Query pode falhar ou perder pedidos offline |
| `status` | `'paid_pending_dispense'` | ⚠️ Filtro `=== 'completed'` em StoreReportsTab/StoreOrdersTab | ✅ Incluído em PAID_ORDER_STATUSES | Pedidos não aparecem como pagos no admin |
| `total` | Número | ✅ | ✅ | OK |
| `paymentStatus` | `'paid'` | ⚠️ Filtro `=== 'paid'` (funciona, mas não inclui 'dispensed') | ✅ Inclui 'paid','completed','dispensed' | Parcialmente OK |
| `paymentMethod` | String | ✅ | ✅ | OK |
| `items[].price` | unitPrice | ⚠️ reportService usa `item.price * item.quantity` para receita de produto — pode divergir de `item.total` | — | Pode divergir se houver descontos |
| `currency` | Dinâmica | ⚠️ Fallback 'INR' no kiosk | — | Deveria ser 'BRL' |

### Schema do dailyStats (escrito por aggregateDailySales):
```
{
  franchiseId, storeId, date,
  totalOrders,       // todos os pedidos
  completedOrders,   // pagos (isPaid)
  cancelledOrders,   // cancelados
  pendingOrders,     // restantes
  totalRevenue,      // soma dos totais dos pagos
  avgTicket,         // totalRevenue / completedOrders
  paymentMethods: { [method]: { count, revenue } },
  hourlyDistribution: { [hour]: { count, revenue } },
  topProducts: [{ productId, title, quantity, revenue }],
  processedAt
}
```

### Schema do metrics/current (escrito por aggOrders):
```
{
  revenue,           // increment dos totais quando isPaidOrder
  orders,            // increment de 1 por pedido novo
  paidOrders,        // increment quando isPaidOrder
  cancelledOrders,   // increment quando cancelado
  pendingOrders,     // increment quando não-pago e não-cancelado (⚠️ paid_pending_dispense NÃO conta)
  lastUpdate,
  paymentMethods: { [method]: { count, revenue } },
  franchiseId, storeId
}
```

### Leitura no getMetricsAdmin:
- Lê `dailyStats.totalRevenue` → salva em `aggregated.revenue` ✅ (receita de pagos)
- Lê `dailyStats.totalOrders` → salva em `aggregated.orders` ⚠️ (total geral, não só pagos)
- Lê `dailyStats.completedOrders` → salva em `aggregated.paidOrders` ✅
- Calcula `averageTicket = revenue / orders` ⚠️ (deveria ser `revenue / paidOrders`)

---

## 5. Resumo de Prioridades

| # | Severidade | Descrição | Correção Estimada |
|---|-----------|------------|-------------------|
| 1 | 🔴 CRÍTICO | Receita inflada (sem filtro de status em 3 telas) | Simples: adicionar filtro |
| 2 | 🔴 CRÍTICO | Ticket médio errado (divisor inclui cancelados) | Simples: ajustar fórmula |
| 3 | 🔴 CRÍTICO | `createdAt` vs `timestamp` no reportService | Simples: trocar campo |
| 4 | 🟡 MODERADO | Fórmula de ticket médio inconsistente entre aggOrders e dailyStats | Simples: alinhar |
| 5 | 🟡 MODERADO | Problemas de UTC vs BRT em dateKey | Médio: requer ajuste no Functions |
| 6 | 🟡 MODERADO | pendingOrders nunca incrementa para paid_pending_dispense | Simples: ajustar lógica |
| 7 | 🟡 MODERADO | DashboardPage sem filtro de data (limit 100 arbitrário) | Simples: adicionar where |
| 10 | 🟡 MODERADO | getMetricsAdmin re-calcula ticket médio com denominador errado | Simples: usar paidOrders |
| 11 | 🟡 MODERADO | StoreReportsTab filtra apenas 'completed' | Simples: expandir filtro |
| 12 | 🟡 MODERADO | StoreOrdersTab idem | Simples: expandir filtro |
| 8 | 🟢 MENOR | Fallback `total_amount` desnecessário | Limpar |
| 9 | 🟢 MENOR | Moeda padrão 'INR' deveria ser 'BRL' | Simples: trocar string |
