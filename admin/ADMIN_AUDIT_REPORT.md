# ADMIN PANEL — EXHAUSTIVE AUDIT REPORT

> **Data:** 2025-01-XX  
> **Escopo:** `admin/src/` — 45+ arquivos auditados  
> **Foco:** Bugs, erros de lógica, race conditions, data integrity, inconsistências

---

## Resumo Executivo

| Severidade | Quantidade |
|------------|-----------|
| **HIGH**   | 6         |
| **MEDIUM** | 8         |
| **LOW**    | 5         |
| **TOTAL**  | **19**    |

---

## 1 · DASHBOARD & FRANCHISE OVERVIEW

### BUG-001 · HIGH — FranchiseOverview: último dia do mês anterior excluído do cálculo de receita

**Arquivo:** `admin/src/pages/dashboard/FranchiseOverview.tsx` (linhas 91–93, 162–170)  
**Descrição:**  
`endOfLastMonth` é criado com `new Date(year, month, 0)`, que retorna a meia-noite (00:00:00.000) do último dia do mês anterior. A query usa `where('timestamp', '<=', Timestamp.fromDate(endOfLastMonth))`, o que exclui **todas as orders do último dia do mês anterior** que ocorreram após 00:00:00.000 (~24h de dados perdidos).

```ts
// Problema:
const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
// ↳ Ex.: 31 Out 00:00:00.000 — exclui orders de 31 Out 00:00:01 até 23:59:59

// Query:
where('timestamp', '<=', Timestamp.fromDate(endOfLastMonth))
```

**Impacto:** O `monthGrowth` (crescimento vs mês anterior) é calculado com dados incompletos do mês passado, potencialmente exibindo crescimento inflado.

**Correção sugerida:**
```ts
// Usar início do mês atual como upper bound exclusivo:
const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 1); // 1º do mês atual, 00:00
// ...
where('timestamp', '<', Timestamp.fromDate(endOfLastMonth)) // < em vez de <=
```

---

### BUG-002 · HIGH — FranchiseOverview: queries N+1 sem limite por loja

**Arquivo:** `admin/src/pages/dashboard/FranchiseOverview.tsx` (linhas 124–185)  
**Descrição:**  
Para CADA loja na franquia, o código faz 3 queries sequenciais (`todayOrders`, `monthOrders`, `lastMonthOrders`) — sem `limit()`. Uma franquia com 10 lojas e 500 pedidos/mês gera **30 queries** (10 × 3) que retornam **potencialmente milhares de documentos** sem paginação.

```ts
for (const store of storesList) {
  // Query 1: pedidos de hoje — SEM LIMIT
  const todayOrdersQuery = await getDocs(
    query(col, where('timestamp', '>=', startOfToday), orderBy('timestamp', 'desc'))
  );
  // Query 2: pedidos do mês — SEM LIMIT
  const monthOrdersQuery = await getDocs(
    query(col, where('timestamp', '>=', startOfMonth))
  );
  // Query 3: pedidos do mês passado — SEM LIMIT
  const lastMonthQuery = await getDocs(
    query(col, where('timestamp', '>=', startOfLastMonth), where('timestamp', '<=', endOfLastMonth))
  );
}
```

**Impacto:** Lentidão extrema em franquias com muitas lojas; possíveis timeouts; custos Firestore elevados.

**Correção sugerida:**  
Usar Cloud Functions (`onWrite` triggers) para manter contadores agregados por loja em `franchises/{fId}/stores/{sId}/dailyStats/{date}`, e ler somente esses docs do dashboard.

---

### BUG-003 · HIGH — DashboardPage: totais sem filtro de data + limit(100)

**Arquivo:** `admin/src/pages/dashboard/DashboardPage.tsx` (linhas 79–92)  
**Descrição:**  
O dashboard principal itera TODAS as lojas e busca `limit(100)` pedidos por loja **sem qualquer filtro de data**. Os "totais" exibidos ("Pedidos" e "Receita") representam apenas os 100 pedidos mais recentes de cada loja, sem contexto temporal.

```ts
for (const store of storesSnapshot.docs) {
  const ordersSnapshot = await getDocs(
    query(collection(db, ...pathSegments), orderBy('timestamp', 'desc'), limit(100))
  );
  ordersSnapshot.docs.forEach(doc => {
    totalOrders++;
    if (order.paymentStatus === 'paid') totalRevenue += order.total || 0;
  });
}
```

**Impacto:** Métricas do dashboard são **enganosas**: "Receita" mostra a soma dos últimos 100 pedidos (pode ser de ontem ou de 6 meses atrás) sem rótulo de período. Uma loja com 200 pedidos mostra receita de metade deles.

**Correção sugerida:**  
Adicionar filtro `where('timestamp', '>=', startOfToday)` ou exibir claramente o período (ex.: "Receita Hoje", "Receita 7 dias").

---

### BUG-004 · MEDIUM — FranchiseOverview: "Pedidos Hoje" conta apenas pagos

**Arquivo:** `admin/src/pages/dashboard/FranchiseOverview.tsx` (linhas 136–141)  
**Descrição:**  
O contador `todayOrders` só incrementa para pedidos com `paymentStatus === 'paid'`. Porém o card exibe "Pedidos Hoje" (label genérico), sugerindo total de pedidos do dia. Pedidos cancelados, pendentes ou reembolsados não são contados.

```ts
todayOrdersQuery.docs.forEach(doc => {
  const order = doc.data();
  if (order.paymentStatus === 'paid') {
    todayOrders++;  // ← Só conta pagos
    todayRevenue += order.total || 0;
  }
});
```

**Impacto:** Operadores podem não perceber que houve pedidos cancelados/problemáticos no dia. O `todayAvgTicket` (que usa `todayOrders` como divisor) está correto, mas o rótulo "Pedidos Hoje" é enganoso.

**Correção sugerida:**  
Separar `todayOrdersTotal` (todos) e `todayOrdersPaid` (pagos). Exibir total no card com breakdown visual (badge "X cancelados").

---

## 2 · TAP ASSIGNMENTS & KEGS

### BUG-005 · HIGH — useTapAssignments: race condition — stale closure no connect/disconnect

**Arquivo:** `admin/src/hooks/useTapAssignments.ts` (linhas 225–235, 315–325)  
**Descrição:**  
As mutations `connect` e `disconnect` referenciam a variável `assignments` da closure do hook, que vem do cache do react-query. Se o cache estiver stale (outra aba conectou um barril, ou outra pessoa atualizou), a mutation opera com dados desatualizados:

- **Connect:** pode não encontrar uma assignment ativa existente → não limpa o barril anterior → tap fica com 2 kegs lógicos.
- **Disconnect:** pode não encontrar a assignment ativa → `throw new Error('Nenhum barril conectado')` mesmo quando há um.

```ts
// No connect:
const existingAssignment = assignments.find(          // ← cache potencialmente stale
  (a) => a.tapId === tapId && a.status === 'active'
);

// No disconnect:
const activeAssignment = assignments.find(            // ← cache potencialmente stale
  (a) => a.tapId === tapId && a.status === 'active'
);
if (!activeAssignment) throw new Error('Nenhum barril conectado a esta torneira');
```

**Impacto:** Inconsistência de dados no Firestore — barril marcado como "tapped" sem assignment ativa, ou tap com `currentKegId` apontando para barril errado.

**Correção sugerida:**  
Dentro da `mutationFn`, fazer um `getDocs` fresco para buscar a assignment ativa, em vez de usar o cache:

```ts
mutationFn: async ({ tapId, kegId }) => {
  // Fetch assignment REAL do Firestore, não do cache
  const freshQ = query(
    assignmentsRef(franchiseId, storeId),
    where('tapId', '==', tapId),
    where('status', '==', 'active')
  );
  const freshSnap = await getDocs(freshQ);
  const existingAssignment = freshSnap.docs[0]
    ? normalizeAssignment(freshSnap.docs[0].id, freshSnap.docs[0].data())
    : null;
  // ... rest of batch logic
};
```

---

## 3 · RANKING & TV DISPLAY

### BUG-006 · HIGH — useCustomerRanking: pedidos cancelados/reembolsados contam no ranking

**Arquivo:** `admin/src/hooks/useCustomerRanking.ts` (linhas 155–175, 90–130)  
**Descrição:**  
A query de orders não filtra por `status` ou `paymentStatus`. A função `aggregateRanking` processa TODOS os pedidos sem verificar se foram cancelados ou reembolsados. Um cliente que cancela 10 pedidos ainda acumula mL e R$ no ranking.

```ts
// Query — sem filtro de status:
const q = query(colRef,
  where('date', '>=', filters.dateFrom),
  where('date', '<=', filters.dateTo),
  orderBy('date', 'desc')
);

// Aggregation — sem verificação:
for (const order of orders) {
  const key = order.customerIdentification || order.customerName;
  if (!key) continue;
  entry.orderCount++;
  entry.totalSpent += order.total || 0;   // ← inclui cancelados
  for (const item of (order.items || [])) {
    entry.totalMl += item.mlPerUnit * item.quantity;  // ← inclui reembolsados
  }
}
```

**Impacto:** Rankings **inflados**. Na TV pública (TvDashboardPage), clientes podem aparecer com posições erradas. Em eventos com prêmios, isso compromete a integridade da competição.

**Correção sugerida:**  
Adicionar filtro na query ou na aggregation:

```ts
// Opção 1: filtro na query (requer composite index):
where('paymentStatus', '==', 'paid'),

// Opção 2: filtro na aggregation (mais simples):
const VALID_STATUSES = ['paid', 'paid_pending_dispense', 'completed', 'dispensing'];
for (const order of orders) {
  if (!VALID_STATUSES.includes(order.paymentStatus)) continue;
  // ... aggregate
}
```

---

### BUG-007 · MEDIUM — useCustomerRanking: query sem `limit()` em modo histórico

**Arquivo:** `admin/src/hooks/useCustomerRanking.ts` (linhas 165–175)  
**Descrição:**  
No modo histórico (dateFrom ≠ today), a query `getDocs` não tem `limit()`. Para ranges longos (90 dias) em lojas movimentadas, pode retornar milhares de documentos.

**Impacto:** Lentidão, custos Firestore elevados, potencial timeout de leitura.

**Correção sugerida:**  
Adicionar `limit(10000)` como safety cap, e considerar paginação via Cloud Functions para ranges longos.

---

## 4 · REPORTS

### BUG-008 · MEDIUM — StoreReportsTab: previousOrders query sem `limit()`

**Arquivo:** `admin/src/components/store/StoreReportsTab.tsx` (linhas 117–130)  
**Descrição:**  
A query do período anterior (`previousOrders`) não tem `limit()`, enquanto a query do período atual tem `limit(5000)`. Para períodos longos (90 dias), o período anterior pode retornar mais dados que o necessário.

```ts
// Current period — tem limit:
query(ordersRef,
  where('timestamp', '>=', startDate),
  orderBy('timestamp', 'desc'),
  firestoreLimit(5000)      // ✓ tem limit
);

// Previous period — SEM limit:
query(ordersRef,
  where('timestamp', '>=', previousPeriodStart),
  where('timestamp', '<', previousPeriodEnd),
  orderBy('timestamp', 'desc')    // ✗ sem limit
);
```

**Impacto:** Query potencialmente mais lenta para o período anterior; inconsistência de approach.

**Correção sugerida:**  
Adicionar `firestoreLimit(5000)` à query do período anterior.

---

### BUG-009 · LOW — StoreReportsTab: startDate não alinhado à meia-noite

**Arquivo:** `admin/src/components/store/StoreReportsTab.tsx` (linhas 98–101)  
**Descrição:**  
`startDate` é calculado como `new Date()` menos N dias, mas herda a hora/minuto/segundo do momento do render. Portanto "Últimos 7 dias" não significa 7 dias completos — pode ser 6 dias e 14 horas, dependendo do horário.

```ts
const startDate = useMemo(() => {
  const date = new Date();
  date.setDate(date.getDate() - parseInt(period));
  return date;  // ← Mantém a hora atual, ex: 14:32:17
}, [period]);
```

**Correção sugerida:**  
```ts
date.setHours(0, 0, 0, 0);  // Alinhar à meia-noite
```

---

## 5 · WASTAGE

### BUG-010 · MEDIUM — useWastage: KPIs incompletos com >100 eventos

**Arquivo:** `admin/src/hooks/useWastage.ts` (linhas 30–50, 70–100)  
**Descrição:**  
A query busca os últimos `limit(100)` eventos de wastage. Os KPIs são calculados filtrando client-side os que caem nos últimos 30 dias. Se houver mais de 100 eventos registrados, os mais antigos são excluídos da query, e os KPIs dos últimos 30 dias ficam incompletos.

```ts
// Query: últimos 100 eventos (pode não cobrir 30 dias completos)
const q = query(ref, orderBy('createdAt', 'desc'), limit(100));

// KPIs: filtram os 100 por data
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const recentEvents = events.filter(e => e.createdAt >= thirtyDaysAgo);
```

**Impacto:** KPIs de wastage (totalMl perdido, % de perda) parecem **diminuir** quando há muitos eventos — falsa sensação de melhora.

**Correção sugerida:**  
Usar `where('createdAt', '>=', thirtyDaysAgo)` na query do Firestore em vez de filtrar client-side sobre um subset limitado.

---

## 6 · STORE SETTINGS

### BUG-011 · MEDIUM — StoreSettingsTab: usa `new Date()` em vez de `serverTimestamp()`

**Arquivo:** `admin/src/components/store/StoreSettingsTab.tsx` (linhas 815–820)  
**Descrição:**  
A mutation de save usa `new Date()` para `updatedAt` e `tapsUpdatedAt`, que são timestamps do **relógio do navegador** do usuário. Se o relógio estiver errado (fuso horário incorreto, drift de clock), o `updatedAt` ficará incorreto.

```ts
await updateDoc(storeRef, {
  ...sanitizedSettings,
  ...dualWrite,
  ...tapsPayload,
  paymentGatewayConfig,
  updatedAt: new Date(),           // ← Client-side timestamp
});

// Também:
tapsPayload.tapsUpdatedAt = new Date();  // ← Client-side timestamp
```

**Impacto:** Timestamps inconsistentes entre documentos que usam `serverTimestamp()` (ex: orders, kegs) e settings que usam `new Date()`. Pode causar confusão em auditorias.

**Correção sugerida:**  
```ts
import { serverTimestamp } from 'firebase/firestore';
// ...
updatedAt: serverTimestamp(),
tapsPayload.tapsUpdatedAt = serverTimestamp();
```

---

### BUG-012 · MEDIUM — StoreSettingsTab: save envia TODA a configuração (risco de sobrescrever campos concorrentes)

**Arquivo:** `admin/src/components/store/StoreSettingsTab.tsx` (linhas 780–820)  
**Descrição:**  
`handleSave` envia o state `settings` inteiro via `updateDoc(storeRef, { ...sanitizedSettings, ... })`. Se outro admin editou um campo diferente entre o load e o save, o `updateDoc` com spread sobrescreve os campos do outro admin com os valores stale do cache deste admin.

Exemplo: Admin A carrega settings, Admin B atualiza `taxId`, Admin A salva mudanças no `name` → o `taxId` de Admin B é revertido.

**Impacto:** Perda de dados em colaboração concorrente.

**Correção sugerida:**  
Usar `updateDoc` com apenas os campos alterados (dirty tracking), ou implementar optimistic concurrency com `tapsVersion` check.

---

## 7 · FINANCE MODULE

### BUG-013 · MEDIUM — useInvoices/useBills: `remaining` não recalculado ao atualizar `total`

**Arquivo:** `admin/src/hooks/useInvoices.ts` (linhas 175–195) e `admin/src/hooks/useBills.ts` (linhas 50–70)  
**Descrição:**  
Ao criar faturas/contas, `remaining = total` e `paidTotal = 0`. A mutation `updateInvoice` permite atualizar `total` sem recalcular `remaining`. Se um admin atualiza o `total` de R$100 para R$150 sem ajustar `remaining`, o saldo devedor fica inconsistente.

```ts
// Create:
remaining: total,
paidTotal: 0,

// Update — permite total sem ajustar remaining:
if (rest.total !== undefined) data.total = rest.total;
// remaining NÃO é recalculado automaticamente
```

**Impacto:** Saldos devedores incorretos; relatórios financeiros com dados inconsistentes.

**Correção sugerida:**  
Na mutation de update, quando `total` mudar, recalcular `remaining = newTotal - paidTotal`:

```ts
if (rest.total !== undefined) {
  data.total = rest.total;
  // Buscar paidTotal atual e recalcular remaining
  const currentDoc = await getDoc(ref);
  const paidTotal = currentDoc.data()?.paidTotal || 0;
  data.remaining = rest.total - paidTotal;
}
```

---

## 8 · COMMERCIAL MODULE (CRM)

### BUG-014 · LOW — CommercialPipelineTab: "Conversão" exibe "/1" quando não há negociações

**Arquivo:** `admin/src/components/store/commercial/CommercialPipelineTab.tsx` (linhas 440–445)  
**Descrição:**  
O display text do card de conversão usa `{deals.length || 1}`, mostrando "0 / 1" quando não há deals. O percentual é correto (0%), mas o denominador "1" é enganoso.

```tsx
<p className="text-2xl font-bold">
  {wonDeals.length} / {deals.length || 1}  {/* Mostra "0 / 1" com 0 deals */}
</p>
```

**Correção sugerida:**  
```tsx
{wonDeals.length} / {deals.length}
```

---

### BUG-015 · LOW — CommercialEventsTab: deleteEvent não exclui subcoleção budgetLines

**Arquivo:** `admin/src/hooks/useCommercialEvents.ts` (via deleteDoc no evento)  
**Descrição:**  
O `deleteEvent` exclui apenas o documento do evento. No Firestore, deletar um documento **não** exclui automaticamente suas subcoleções. As `budgetLines` do evento excluído ficam órfãs.

**Impacto:** Dados órfãos se acumulam no Firestore; custos de armazenamento crescem.

**Correção sugerida:**  
Antes de deletar o evento, buscar e deletar todas as budgetLines:

```ts
const lines = await getDocs(budgetLinesRef(franchiseId, storeId, eventId));
const batch = writeBatch(db);
lines.docs.forEach(d => batch.delete(d.ref));
batch.delete(eventDocRef(franchiseId, storeId, eventId));
await batch.commit();
```

**Nota:** O mesmo problema se aplica a `useQuotes.deleteQuote` (subcoleção `lines`).

---

## 9 · INVENTORY

### BUG-016 · LOW — StoreInventoryTab: log de ADJUST registra valor absoluto, não delta

**Arquivo:** `admin/src/components/store/StoreInventoryTab.tsx` (linhas 200–225)  
**Descrição:**  
Quando `adjustmentType === 'ADJUST'`, o campo `quantity` no log é o **valor absoluto** de destino, não a diferença. A interface já registra `previousStock` e `newStock`, mas o campo `quantity` fica confuso para análise.

```ts
case 'ADJUST':
  newStock = quantity;  // ← quantity é o target, mas log.quantity também é o target
  break;

// Log:
log: {
  type: adjustmentType,  // 'ADJUST'
  quantity,              // ← Valor absoluto, não delta
  previousStock: currentStock,
  newStock,
}
```

**Impacto:** Relatórios de movimentação podem interpretar `quantity` como "quanto foi adicionado/removido" quando na verdade é o valor final.

**Correção sugerida:**  
Para type ADJUST, registrar o delta em um campo separado ou usar `quantity: newStock - currentStock`.

---

## 10 · CONTEXTS & AUTH

### BUG-017 · MEDIUM — FranchiseContext: audit log de login pode duplicar em StrictMode

**Arquivo:** `admin/src/context/FranchiseContext.tsx` (useEffect de audit login)  
**Descrição:**  
O audit logging de login é feito em um `useEffect` que depende do estado de auth/franchise. Em React StrictMode (dev), effects rodam 2x. Embora haja deduplicação via `sessionStorage`, a lógica pode falhar se o `sessionStorage` key for diferente entre invocações (ex.: se `franchiseId` muda durante a reconciliação do StrictMode).

**Impacto:** Entradas duplicadas de audit log em desenvolvimento; possível duplicação em produção com hard navigations.

**Correção sugerida:**  
Usar `useRef` como guard adicional:

```ts
const loggedRef = useRef(false);
useEffect(() => {
  if (loggedRef.current) return;
  loggedRef.current = true;
  // ... audit log
}, []);
```

---

## 11 · PATH RESOLVER & TYPES

### BUG-018 · LOW — pathResolver: FinanceSubcollection desalinhado com nomes reais

**Arquivo:** `admin/src/lib/pathResolver.ts` (linhas 50–60) vs hooks de finance  
**Descrição:**  
O `FinanceSubcollection` type lista nomes como `'invoices'`, `'bills'`, `'ledger'`, mas os hooks usam `'finInvoices'`, `'finBills'`, `'finLedger'`. Se alguém usar o pathResolver para finance, gerará paths errados.

```ts
// pathResolver:
export type FinanceSubcollection = 'invoices' | 'bills' | 'ledger' | ...

// hooks reais:
collection(db, '...', 'finInvoices')  // ← 'fin' prefix
collection(db, '...', 'finBills')
collection(db, '...', 'finLedger')
```

**Impacto:** Nenhum impacto runtime atual (hooks não usam pathResolver), mas é uma armadilha para futuras features.

**Correção sugerida:**  
Atualizar os nomes no pathResolver para corresponder aos reais, ou adicionar `financeSubPath()` que aplica o prefixo.

---

### BUG-019 · LOW — DealDialog: estado do form não reseta ao trocar de deal no modo edit

**Arquivo:** `admin/src/components/store/commercial/CommercialPipelineTab.tsx` (linhas 115–130)  
**Descrição:**  
Os `useState` no `DealDialog` usam `initialData` somente como valor inicial. Se a prop `initialData` mudar sem o componente desmontar (ex: clique direto de um deal para outro sem fechar o dialog), o form mantém os dados do deal anterior.

```tsx
const [title, setTitle] = useState(initialData?.title || '');
// ↑ Não atualiza se initialData mudar após mount
```

Na implementação atual, `editingDeal` é setado como `null` ao fechar, remontando o componente. Porém, se um futuro refactor mudar essa lógica (ex: dialog aberto permanentemente), o bug se manifestará.

**Impacto:** Baixo no código atual (a lógica de open/close protege), mas é um pattern frágil.

**Correção sugerida:**  
Adicionar `useEffect` para sincronizar:

```tsx
useEffect(() => {
  if (initialData) {
    setTitle(initialData.title || '');
    setCustomerId(initialData.customerId || '');
    // ...
  }
}, [initialData]);
```

---

## Tabela de Rastreamento

| Bug ID  | Severidade | Módulo          | Arquivo                          | Status    |
|---------|-----------|-----------------|----------------------------------|-----------|
| BUG-001 | HIGH      | Dashboard       | FranchiseOverview.tsx            | ⬜ aberto |
| BUG-002 | HIGH      | Dashboard       | FranchiseOverview.tsx            | ⬜ aberto |
| BUG-003 | HIGH      | Dashboard       | DashboardPage.tsx                | ⬜ aberto |
| BUG-004 | MEDIUM    | Dashboard       | FranchiseOverview.tsx            | ⬜ aberto |
| BUG-005 | HIGH      | Kegs/Taps       | useTapAssignments.ts             | ⬜ aberto |
| BUG-006 | HIGH      | Ranking/TV      | useCustomerRanking.ts            | ⬜ aberto |
| BUG-007 | MEDIUM    | Ranking/TV      | useCustomerRanking.ts            | ⬜ aberto |
| BUG-008 | MEDIUM    | Reports         | StoreReportsTab.tsx              | ⬜ aberto |
| BUG-009 | LOW       | Reports         | StoreReportsTab.tsx              | ⬜ aberto |
| BUG-010 | MEDIUM    | Wastage         | useWastage.ts                    | ⬜ aberto |
| BUG-011 | MEDIUM    | Settings        | StoreSettingsTab.tsx              | ⬜ aberto |
| BUG-012 | MEDIUM    | Settings        | StoreSettingsTab.tsx              | ⬜ aberto |
| BUG-013 | MEDIUM    | Finance         | useInvoices.ts / useBills.ts     | ⬜ aberto |
| BUG-014 | LOW       | Commercial      | CommercialPipelineTab.tsx        | ⬜ aberto |
| BUG-015 | LOW       | Commercial      | useCommercialEvents.ts / useQuotes.ts | ⬜ aberto |
| BUG-016 | LOW       | Inventory       | StoreInventoryTab.tsx            | ⬜ aberto |
| BUG-017 | MEDIUM    | Auth/Context    | FranchiseContext.tsx             | ⬜ aberto |
| BUG-018 | LOW       | Infra/Types     | pathResolver.ts                  | ⬜ aberto |
| BUG-019 | LOW       | Commercial      | CommercialPipelineTab.tsx        | ⬜ aberto |

---

## Priorização Recomendada

### Sprint 1 (Crítico — Data Integrity)
1. **BUG-006** — Ranking conta pedidos cancelados → corrompe competição TV
2. **BUG-005** — Race condition em connect/disconnect → inconsistência Firestore
3. **BUG-001** — Receita do mês anterior perdendo ~24h de dados

### Sprint 2 (Performance & Accuracy)
4. **BUG-002** — N+1 queries na FranchiseOverview
5. **BUG-003** — Dashboard sem filtro de data
6. **BUG-010** — KPIs de wastage incompletos
7. **BUG-013** — `remaining` inconsistente no finance

### Sprint 3 (Polish & Robustness)
8. **BUG-004, BUG-011, BUG-012, BUG-008, BUG-017**
9. **BUG-007, BUG-009, BUG-014–019**
