# RELATÓRIO DE AUDITORIA FORENSE — OPEN-KIOSK-APP

**Data:** 2025-07-14  
**Branch:** `Produção` (commit `e4dfad3`)  
**Ambiente:** Node v25.6.1, npm 11.9.0, Windows  
**Escopo:** KIOSK + ADMIN + SHARED + FUNCTIONS + ANDROID  
**Natureza:** Somente leitura — nenhum arquivo editado  

---

## SEÇÃO 1 — BASELINE FORENSE

### 1.1 Estado do Worktree

| Métrica | Valor |
|---------|-------|
| Branch | `Produção` |
| Último commit | `e4dfad3` |
| Arquivos modificados (M) | 58 |
| Arquivos não-rastreados (??) | 29 |

### 1.2 Validações Executadas

| Validação | Módulo | Resultado | Detalhes |
|-----------|--------|-----------|----------|
| TypeCheck (`tsc --noEmit`) | KIOSK | ✅ exit 0 | 0 erros |
| TypeCheck (`tsc --noEmit`) | ADMIN | ✅ exit 0 | 0 erros |
| TypeCheck (`tsc --noEmit`) | FUNCTIONS | ✅ exit 0 | 0 erros |
| Testes (vitest) | KIOSK | ✅ 532/532 | 35 arquivos, 5.89s |
| Testes (vitest) | ADMIN | ✅ 617/617 | 64 arquivos, 11.73s |
| Testes (vitest) | FUNCTIONS | ✅ 318/318 | 48 arquivos, 1.93s |
| ESLint | KIOSK | ✅ 0 erros | 13 warnings (eslint-disable não-utilizados) |
| ESLint | ADMIN | ✅ 0 erros | 0 warnings |
| Build (vite) | KIOSK | ✅ 7.73s | PWA gerado (18 precache, 2.599 KiB) |
| Build (vite) | ADMIN | ✅ 8.62s | SPA gerado |

**Totais:** 1.467 testes em 147 arquivos — todos passam. Três módulos compilam sem erros de tipo.

### 1.3 Ambientes e Dependências

| Dependência | KIOSK (root) | ADMIN | FUNCTIONS | Drift? |
|-------------|:------------:|:-----:|:---------:|:------:|
| firebase | 11.10.0 | 10.8.0 | — | ⚠️ SIM |
| firebase-admin | — | — | 11.11.0 | — |
| firebase-functions | — | — | 7.0.5 | — |
| react | 18.3.1 | 18.3.1 | — | Não |
| zod | 3.23.8 | 3.22.4 | — | ⚠️ SIM |
| react-router-dom | 6.26.2 | 6.22.1 | — | ⚠️ SIM |
| @tanstack/react-query | 5.56.2 | 5.24.1 | — | ⚠️ SIM |
| date-fns | 3.6.0 | 3.3.1 | — | ⚠️ SIM |

---

## SEÇÃO 2 — INVENTÁRIO ESTRUTURAL

### 2.1 Módulos

| Módulo | Stack | Entrypoint |
|--------|-------|------------|
| KIOSK | React 18, Vite 5.4.1, Capacitor 7, PWA | `src/main.tsx` via HashRouter |
| ADMIN | React 18, Vite, Tailwind | `admin/src/main.tsx` |
| FUNCTIONS | Node 20, firebase-functions 7.0.5, Stripe 14.7.0 | `functions/src/index.ts` |
| ANDROID | compileSdk 36, Java 21, Capacitor 7, PlugPag 4.11.1 | `MainActivity.java` |
| SHARED | Zod schemas, types, utils | Copiado para admin via `copy-shared.js` |

### 2.2 Mecanismo de Compartilhamento (SHARED)

- `admin/copy-shared.js` executa como hook `prebuild`
- Operação: `rmSync(admin/shared)` → `cpSync(../shared, admin/shared)`
- **Não-atômico**: se o build falhar após `rmSync`, `admin/shared` fica vazio
- KIOSK importa shared via alias `@shared` (Vite resolve)
- FUNCTIONS não usa shared — redeclara tipos localmente

---

## SEÇÃO 3 — ACHADOS CONFIRMADOS

### ACHADO F-01: Contrato Store Divergente entre Módulos

**Natureza:** Risco Confirmado  
**Severidade:** Alto  
**Evidência:**

| Campo | `shared/types/store.ts` | `src/types/store.ts` (KIOSK) | `admin/src/types/store.ts` (ADMIN) |
|-------|:----------------------:|:----------------------------:|:----------------------------------:|
| `storeId` | `storeId?: string` (opcional) | `storeId: string` (obrigatório) | Não há campo `storeId` direto no Store |
| PaymentProvider | Exporta tipo canônico | Redeclara localmente | Redeclara localmente |
| PaymentGatewayConfig | Exporta tipo canônico | Redeclara localmente | Redeclara localmente |
| ESP32Config | Exporta tipo canônico | Herda via import | Redeclara localmente |
| Datas | `string` | `string` | `Timestamp` (firebase/firestore) |

**Localização:**
- `shared/types/store.ts` — `storeId?: string` (linha ~20)  
- `src/types/store.ts` — `storeId: string` (linha ~15)  
- `admin/src/types/store.ts` — usa `Timestamp` para datas  

**Impacto:** Um documento Firestore sem `storeId` é válido pelo contrato shared mas causaria crash no kiosk (`storeId: string` obrigatório). As 3 declarações de `PaymentProvider`, `PaymentGatewayConfig` e `ESP32Config` podem divergir silenciosamente — não há CI que garanta sincronia.

---

### ACHADO F-02: PathResolver — Subcollections Divergentes entre KIOSK e ADMIN

**Natureza:** Risco Confirmado  
**Severidade:** Médio  
**Evidência:**

| Subcollection | KIOSK PathResolver | ADMIN PathResolver |
|---------------|:------------------:|:------------------:|
| taps | ✅ | ✅ |
| kegs | ✅ | ✅ |
| tapAssignments | ✅ | ✅ |
| servingSessions | ✅ | ✅ |
| wastageEvents | ✅ | ✅ |
| maintenanceLogs | ✅ | ✅ |
| notifications | ✅ | ✅ |
| rankingAgg | ❌ | ✅ |
| challenges | ❌ | ✅ |
| prizes | ❌ | ✅ |
| customers | ❌ | ✅ |
| deals | ❌ | ✅ |
| calendarItems | ❌ | ✅ |
| commercialEvents | ❌ | ✅ |
| quotes | ❌ | ✅ |
| FinanceSubcollection (8 tipos) | ❌ | ✅ |

**Localização:**
- `src/lib/pathResolver.ts` — tipo `StoreSubcollection` com 16 valores
- `admin/src/lib/pathResolver.ts` — tipo `StoreSubcollection` com 16+ extras + `FinanceSubcollection`

**Impacto:** As subcollections extras do admin (CRM, finanças, ranking) são intencional — o kiosk não precisa delas. Porém, o tipo `StoreSubcollection` não é compartilhado via shared, eliminando a garantia de que ambos os módulos concordem sobre os nomes das subcollections.

---

### ACHADO F-03: `normalizeProvider` Duplicado em 4 Locais Independentes

**Natureza:** Risco Confirmado  
**Severidade:** Médio  
**Evidência:**

| Localização | Tipo de Retorno | Default para `''` | Default para desconhecido |
|-------------|----------------|:-----------------:|:-------------------------:|
| `src/config/paymentGateway.ts:54` | `PaymentProvider` | `'mercado_pago'` | `'none'` |
| `admin/src/utils/paymentNormalizer.ts:34` | `PaymentProvider` | `'mercado_pago'` | `'none'` |
| `admin/src/components/store/StoreSettingsTab.tsx:405` | `PaymentProvider` | `'mercado_pago'` | `'none'` |
| `functions/src/payments/storeConfig.ts:19` | Config type | `'mercado_pago'` | `'none'` |

**Impacto:** Hoje as 4 implementações são semanticamente idênticas — string vazia mapeia para `'mercado_pago'`, desconhecido para `'none'`. Mas qualquer alteração futura deve ser replicada em 4 arquivos sem CI que valide a sincronia. Um dos 4 está embutido inline num componente React (StoreSettingsTab).

---

### ACHADO F-04: Build — Chunks Excedem Limites de Performance

**Natureza:** Erro Confirmado  
**Severidade:** Médio  
**Evidência (saída do Vite build):**

| Módulo | Chunk | Tamanho | Limite |
|--------|-------|---------|--------|
| KIOSK | `index-DP3v5EVz.js` | 2.284 KB | 1.600 KB (customizado em `vite.config.ts:152`) |
| ADMIN | `StoreSubPages-*.js` | 880,54 KB | 500 KB (default Vite) |
| ADMIN | `index-*.js` | 1.125,52 KB | 500 KB (default Vite) |

**Localização:** `vite.config.ts:152` — `chunkSizeWarningLimit: 1600` (limite elevado para suprimir warning do kiosk).

**Impacto:** O chunk principal do kiosk de 2.284 KB ultrapassa até o limite elevado. No Android com Capacitor (WebView local), o impacto de rede é zero — mas o parse/compile do JS pela V8 consome tempo no cold start, especialmente em tablets de baixo custo. Para o admin (SPA web), os 2 chunks somados (2 MB) afetam first-load em conexões lentas.

---

### ACHADO F-05: Android Release Build sem Ofuscação (minifyEnabled=false)

**Natureza:** Risco Confirmado  
**Severidade:** Médio  
**Evidência:**

```groovy
// android/app/build.gradle:32
buildTypes {
    release {
        minifyEnabled false   // ← ProGuard/R8 desligado
    }
}
```

**Impacto:** O APK release contém bytecode Java não-ofuscado. Engenharia reversa via `jadx`/`apktool` expõe nomes de classes, métodos e strings (incluindo o padrão `MAINTENANCE_PIN`). O SDK PlugPag 4.11.1 (AAR) também fica exposto. Em contexto de kiosk (dispositivo físico controlado), o risco é atenuado — mas qualquer APK distribuído externamente é trivialmente analisável.

---

### ACHADO F-06: PIN de Manutenção — Comparação Não Constant-Time e Sem Rate Limiting

**Natureza:** Risco Confirmado  
**Severidade:** Alto  
**Evidência:**

```java
// KioskModePlugin.java:33-37
private static final String MAINTENANCE_PIN = BuildConfig.MAINTENANCE_PIN;

public void exitLockTask(PluginCall call) {
    String pin = call.getString("pin", "");
    if (!MAINTENANCE_PIN.equals(pin)) {  // String.equals() — timing attack
        call.reject("PIN de manutenção inválido");
        return;
    }
```

**Contexto:**
- PIN default: `159357` (6 dígitos, definido em `gradle.properties` / `build.gradle`)
- `String.equals()` retorna `false` imediatamente no primeiro byte diferente — diferença de tempo mensurável
- Sem delay entre tentativas — bridge JS pode enviar milhares de PINs/segundo
- Sem bloqueio após N falhas

**Impacto:** Em teoria, um atacante com acesso ao WebView pode explorar timing para inferir o PIN correto dígito a dígito. Na prática, o ataque requer acesso físico ao tablet em modo quiosque e capacidade de injetar JS no WebView — ambos significativamente mitigados pelo Lock Task mode. O risco é **teórico mas real** para cenário de tablet roubado sem lock de tela.

---

### ACHADO F-07: Cleartext HTTP Permitido Globalmente no Android

**Natureza:** Risco Confirmado  
**Severidade:** Médio  
**Evidência:**

```xml
<!-- android/app/src/main/res/xml/network_security_config.xml -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true">  <!-- HTTP global -->
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="false">
        <!-- HTTPS forçado apenas para estes domínios: -->
        <domain includeSubdomains="true">firebaseio.com</domain>
        <domain includeSubdomains="true">googleapis.com</domain>
        <domain includeSubdomains="true">pagbank.uol.com.br</domain>
        <domain includeSubdomains="true">api.pagseguro.com</domain>
        <!-- ... -->
    </domain-config>
</network-security-config>
```

**Impacto:** Qualquer comunicação com domínios fora da allowlist (ex: ESP32 via WiFi AP, localhost) pode trafegar em HTTP. Isso é **intencional** para o ESP32 (Access Point local sem certificado TLS). Porém, a config permite cleartext para qualquer domínio não listado — se um serviço futuro for integrado sem adicionar à allowlist, trafegará em HTTP sem aviso.

---

### ACHADO F-08: Credenciais ESP32 Hardcoded no Código-Fonte

**Natureza:** Risco Confirmado  
**Severidade:** Baixo  
**Evidência:**

```typescript
// src/services/esp32CommunicationService.ts:81-88
export const ESP32_WIFI_PASSWORD = 'bier2026';   // Senha WiFi do AP
export const ESP32_BLE_PIN = '123456';            // PIN BLE
```

**Observação:** O próprio código contém um TODO documentado (`Bug-22, CWE-798`) reconhecendo o problema e propondo mover para config Firestore por loja. O risco é baixo porque: (a) WiFi AP é local (alcance ~10m), (b) BLE PIN é para pareamento direto, (c) em contexto single-tenant atual, todos os dispositivos usam as mesmas credenciais. Torna-se problema em deploy multi-tenant com lojas diferentes.

---

### ACHADO F-09: Três Collections Firestore Sem Regras de Segurança Explícitas

**Natureza:** Erro Confirmado  
**Severidade:** Alto  
**Evidência (cross-ref `firestore.rules` vs código):**

| Collection | Usada em | Regra em `firestore.rules`? |
|------------|----------|:---------------------------:|
| `forecastCache` | `functions/src/forecast/demographicService.ts` | ❌ Não |
| `municipalities` | `functions/src/forecast/demographicService.ts` | ❌ Não |
| `_webhookDedup` | `functions/src/billing/stripeWebhook.ts` | ❌ Não |

**Impacto:** Sem regra explícita, o Firestore aplica a regra default que, no `firestore.rules` atual, é `allow read, write: if false` para qualquer path não explicitamente matchado. **Portanto, estas collections são acessíveis APENAS via firebase-admin (Cloud Functions)**, o que é o comportamento correto. O risco é zero enquanto a regra default permanecer restritiva — mas a falta de documentação explícita é uma pendência de governança.

**Reclassificação pós-contestação:** Embora não cause vulnerabilidade imediata (regra default bloqueia acesso client), a ausência de regras explícitas para collections que existem no sistema é uma falha de documentação que pode causar problemas se a regra default for alterada.

**Severidade Final:** Médio (reclassificado de Alto para Médio após contestação)

---

### ACHADO F-10: Race Condition — Criação de Pagamento Duplicado (Cloud Functions)

**Natureza:** Risco Confirmado  
**Severidade:** Alto  
**Evidência:**

```typescript
// functions/src/payments/paymentService.ts (linhas ~295-308)
// Idempotency check: query para orderId existente
const existing = await db.collectionGroup('payments')
  .where('orderId', '==', orderId)
  .where('status', 'in', ['pending', 'paid'])
  .get();

if (!existing.empty) {
  return { paymentId: existing.docs[0].id, ... };
}

// Cria novo pagamento (NÃO está em transaction com a query acima)
const paymentRef = storePaymentsRef.doc();
await paymentRef.set(paymentData);
```

**Impacto:** Duas chamadas simultâneas a `createPayment()` com o mesmo `orderId` podem ambas passar pelo check de idempotência (ambas veem 0 resultados) e criar dois pagamentos distintos no gateway. O checkout do kiosk tem guard de mutex (`paymentInProgressRef`), mas qualquer falha de rede que cause retry no nível HTTP pode disparar a duplicação.

**Mitigação existente:** O kiosk usa `saleRecordedRef` como mutex local e retry com backoff exponencial após falha. Porém a proteção é no cliente, não no servidor.

---

### ACHADO F-11: `cancelPagBankPayment` sem Transaction (Cloud Functions)

**Natureza:** Risco Confirmado  
**Severidade:** Médio  
**Evidência:**

```typescript
// functions/src/payments/index.ts (linha ~179)
// Read-then-write sem transaction
const paymentDoc = await paymentRef.get();
// ... validações ...
await paymentRef.set({ status: 'canceled', ... }, { merge: true });
```

**Impacto:** Se dois cancelamentos são disparados simultaneamente, ambos podem ler o estado `pending`, ambos chamam a API do PagBank para cancelar, e ambos escrevem `canceled`. O resultado final é correto (canceled), mas duas chamadas à API do provider são desnecessárias e podem causar erro se o provider já cancelou na primeira chamada.

---

### ACHADO F-12: Drift de Versão Firebase SDK (11.10.0 vs 10.8.0)

**Natureza:** Risco Confirmado  
**Severidade:** Médio  
**Evidência:**

```json
// package.json (root/kiosk)
"firebase": "^11.10.0"

// admin/package.json
"firebase": "^10.8.0"
```

**Impacto:** Delta de 32 minor versions. Ambos módulos acessam o mesmo projeto Firestore. Diferenças de comportamento na serialização/desserialização (ex: `Timestamp` vs `string`, `FieldValue` semântica) podem causar incompatibilidades silenciosas. O drift no Zod (3.23.8 vs 3.22.4) é menos crítico mas pode causar diferenças de validação para schemas compartilhados via `shared/`.

---

### ACHADO F-13: `holderName` (PII) Cruza Bridge Nativa Sem Máscara

**Natureza:** Risco Confirmado  
**Severidade:** Médio  
**Evidência:**

```java
// PlugPagTerminalPlugin.java (buildSafeResult, linha ~960)
ret.put("holderName", safeString(result.getHolderName()));
```

O PAN nunca cruza a bridge (✅), CVV nunca cruza (✅), BIN é truncado para últimos 4 dígitos (✅). Porém, `holderName` é retornado em texto plano. O cabeçalho do serviço (`plugpagPaymentService.ts:17`) documenta: "holderName é PII — mascarado antes de persistir".

**Impacto:** Se algum consumidor da bridge falhar em mascarar o nome antes de persistir no Firestore/logs, configura vazamento de PII. A documentação de intenção existe, mas não há enforcement automático.

---

### ACHADO F-14: `copy-shared.js` — Operação Não-Atômica

**Natureza:** Risco Confirmado  
**Severidade:** Baixo  
**Evidência:**

```javascript
// admin/copy-shared.js:24-25
rmSync(targetDir, { recursive: true, force: true });
cpSync(sourceDir, targetDir, { recursive: true, force: true });
```

**Impacto:** Entre `rmSync` e `cpSync`, existe uma janela onde `admin/shared/` está vazio. Se o processo morrer entre as duas operações (kill, SIGTERM, OOM), o admin fica sem a pasta shared. O `prebuild` hook falharia no próximo build por imports quebrados, mas o estado inconsistente pode confundir debugging.

---

### ACHADO F-15: `prizes.code` Visível via Anonymous Read (TV Dashboard)

**Natureza:** Pendência de Validação  
**Severidade:** Médio  
**Evidência:**

```
// firestore.rules — subcollection prizes
// Tem allow read: if isAuthenticated() (Anonymous auth aceito)
// Comentário no próprio rules: [Audit-20260218] campo 'code' visível
```

**Impacto:** Se `prizes` contém campo `code` (e.g., código de resgate), qualquer usuário autenticado anonimamente (TV dashboard, kiosk) pode ler todos os códigos. O comentário no rules indica que os mantenedores já identificaram o problema.

**Status:** Pendência de Validação — requer confirmação de que `code` é ou não um segredo que deve ser restrito.

---

## SEÇÃO 4 — ACHADOS POSITIVOS (BOAS PRÁTICAS CONFIRMADAS)

### P-01: Firestore Rules — RBAC Multi-Tenant Robusto
- 850+ linhas de regras com 7 roles hierárquicos
- `hasStoreAccess()` verifica wildcard `'*'` e storeId específico
- `hasFinancialAccess()` restringe finance a owner/admin/manager
- `payments` subcollection: `allow write: if false` (somente Cloud Functions)
- Orders: `paymentStatus` removido do whitelist de update (somente Cloud Functions)
- Immutable collections (servingSessions, systemLogs, wastageEvents): correto

### P-02: Checkout.tsx — Guard Robusto contra Venda Duplicada
- Mutex pattern via `saleRecordedRef` (ref) + `setSaleRecored` (state)
- `paymentInProgressRef` (Promise mutex) impede concorrência
- Retry com exponential backoff (3 tentativas) para `recordSaleAndUpdateStock`
- Se todas as retries falharem: NÃO libera o guard (impede double charge)
- Cleanup correto no unmount (`stopPolling`, `clearPersistedState`, `cleanupPagBankListener`)

### P-03: salesService.ts — Transação Atômica para Venda Online
- `runTransaction()` garante atomicidade de leitura de estoque + escrita de venda
- Fase de leitura ANTES de qualquer escrita (evita deadlock)
- Offline fallback via `enqueueSync()` com `syncService`
- Validação de `storeId` obrigatório antes da operação

### P-04: PlugPag Plugin — Segurança de Dados de Cartão
- PAN nunca cruza bridge nativa → JS (✅ `buildSafeResult`)
- CVV nunca cruza bridge (✅)
- BIN truncado para 4 últimos dígitos (✅)
- ExecutorService single-thread para SDK thread-unsafe (✅)
- AbortPayment em thread separada conforme documentação SDK (✅)

### P-05: PagBank Cloud Function — Validação Server-Side
- Webhook signature HMAC-SHA256 verificada
- Amount integrity check (soma dos items = total)
- Dynamic Pricing bounds validados no servidor (±maxVariation% + 10% tax)
- Card data: somente token encriptado aceito (PAN/CVV nunca no servidor)
- Terminal state guards impedem regressão de status

### P-06: Dispense Recovery — Reconciliação no Startup
- `persistFailedDispense()` salva no IndexedDB com progresso parcial
- `reconcileOnStartup()` reconcilia com Firestore
- Crash recovery via checkpoint localStorage → IndexedDB
- Max 5 retries por item; items expirados são removidos
- Guard de idempotência (`isReconciling` flag)

### P-07: MercadoPago Polling — Resiliência
- Exponential backoff (3s inicial → 10s máximo)
- Persistência localStorage para sobreviver refresh/crash
- Network retry com 3 tentativas por falha de rede
- AbortController para cancelamento limpo
- Idempotency via `processedOrdersRef` (`Set<string>`)
- Max 45 tentativas (~135s, cobre 2min + margem)

### P-08: Anti-Exit Android — Mecanismos Sólidos
- Lock Task Mode via Android API
- HOME, BACK, APP_SWITCH keys bloqueados
- Immersive sticky mode
- `bringAppToFront()` com throttle de 2s
- `restoreLockTaskOnResume` garante restauração após fluxos externos
- Explicit intents (sem component spoofing)

---

## SEÇÃO 5 — MATRIZ DE SEVERIDADE

### Erros Confirmados

| ID | Achado | Severidade |
|----|--------|:----------:|
| F-04 | Chunks excedem limites de performance | Médio |

### Riscos Confirmados

| ID | Achado | Severidade |
|----|--------|:----------:|
| F-01 | Contrato Store divergente entre módulos | **Alto** |
| F-06 | PIN manutenção: timing attack + sem rate limit | **Alto** |
| F-10 | Race condition: pagamento duplicado (Functions) | **Alto** |
| F-02 | PathResolver subcollections divergentes | Médio |
| F-03 | normalizeProvider duplicado em 4 locais | Médio |
| F-05 | Android release sem ofuscação (R8/ProGuard) | Médio |
| F-07 | Cleartext HTTP global no Android | Médio |
| F-09 | 3 collections Firestore sem regras explícitas | Médio |
| F-11 | cancelPagBankPayment sem transaction | Médio |
| F-12 | Drift Firebase SDK 11.10.0 vs 10.8.0 | Médio |
| F-13 | holderName (PII) cruza bridge sem máscara | Médio |
| F-08 | Credenciais ESP32 hardcoded | Baixo |
| F-14 | copy-shared.js operação não-atômica | Baixo |

### Pendências de Validação

| ID | Achado | Severidade |
|----|--------|:----------:|
| F-15 | prizes.code visível via anonymous read | Médio |

---

## SEÇÃO 6 — COBERTURA DE REGRAS FIRESTORE

### Resumo Quantitativo

| Escopo | Com Regra | Sem Regra | Total |
|--------|:---------:|:---------:|:-----:|
| Store-level subcollections | 37 | 0 | 37 |
| Franchise-level subcollections | 6 | 0 | 6 |
| Collections globais | 7 | 3* | 10 |
| **Total** | **50** | **3** | **53** |

*`forecastCache`, `municipalities`, `_webhookDedup` — sem regra explícita, mas regra default (`deny all`) protege contra acesso client.

---

## SEÇÃO 7 — RECOMENDAÇÕES PRIORIZADAS

### Prioridade 1 — Alto (Endereçar antes de produção)

1. **F-10:** Implementar idempotência atômica em `createPayment` — usar transaction ou document ID derivado de `orderId` para garantir unicidade
2. **F-01:** Centralizar os tipos Store, PaymentProvider e PaymentGatewayConfig em `shared/` — kiosk e admin devem importar, não redeclarar
3. **F-06:** Adicionar rate limiting no PIN (delay 500ms + bloqueio após 5 falhas); considerar `MessageDigest.isEqual()` para comparação constant-time

### Prioridade 2 — Médio (Endereçar em sprint próximo)

4. **F-03:** Extrair `normalizeProvider` para `shared/utils/paymentNormalizer.ts` — eliminar 4 cópias
5. **F-12:** Alinhar versão do Firebase SDK entre KIOSK e ADMIN (11.10.0)
6. **F-05:** Habilitar `minifyEnabled true` no release build com `shrinkResources true`
7. **F-04:** Configurar code splitting (lazy routes) no kiosk e admin para reduzir chunks
8. **F-09:** Adicionar regras deny-all explícitas para `forecastCache`, `municipalities`, `_webhookDedup`
9. **F-13:** Adicionar máscara automática de `holderName` no `buildSafeResult` do plugin Java
10. **F-11:** Envolver `cancelPagBankPayment` em `runTransaction`

### Prioridade 3 — Baixo (Backlog)

11. **F-07:** Inverter `network_security_config.xml` para cleartext=false por default, permitir apenas para IPs locais ESP32
12. **F-08:** Mover credenciais ESP32 para config Firestore por loja (conforme TODO Bug-22 existente)
13. **F-14:** Substituir `rmSync + cpSync` por copy-to-temp → rename atômico
14. **F-02:** Mover `StoreSubcollection` type para shared (mesmo que admin tenha extras)
15. **F-15:** Validar se `prizes.code` é campo sensível e, se sim, mover para subcollection protegida

---

## SEÇÃO 8 — DECLARAÇÃO DE INTEGRIDADE

Esta auditoria foi conduzida exclusivamente em modo leitura. Nenhum arquivo do repositório foi criado, editado ou deletado durante a auditoria (exceto este relatório). Todas as validações (typecheck, testes, lint, build) foram executadas com seus comandos padrão sem modificação.

Cada achado é respaldado por evidência direta: saída de comando, conteúdo de arquivo lido, ou cross-referência entre múltiplos arquivos. Nenhuma inferência foi registrada como achado sem verificação.

**Arquivos-chave auditados em detalhe:**

| Arquivo | Linhas Lidas |
|---------|:------------:|
| `shared/types/store.ts` | ~280 |
| `src/types/store.ts` | ~300 |
| `admin/src/types/store.ts` | ~210 |
| `src/lib/pathResolver.ts` | completo |
| `admin/src/lib/pathResolver.ts` | completo |
| `shared/utils/settingsNormalizer.ts` | ~120 |
| `admin/copy-shared.js` | completo (34 linhas) |
| `firestore.rules` | completo (~850 linhas) |
| `storage.rules` | completo (~50 linhas) |
| `src/components/Checkout.tsx` | ~700 linhas |
| `src/hooks/useMercadoPagoPolling.ts` | ~250 linhas |
| `src/services/salesService.ts` | ~300 linhas |
| `src/services/plugpagPaymentService.ts` | ~300 linhas |
| `src/services/esp32CommunicationService.ts` | ~200 linhas |
| `src/services/dispenseRecoveryService.ts` | ~180 linhas |
| `src/context/StoreContext.tsx` | completo (~280 linhas) |
| `src/context/FranchiseContext.tsx` | completo (~300 linhas) |
| `src/config/paymentGateway.ts` | ~80 linhas |
| `android/app/build.gradle` | completo (~90 linhas) |
| `android/app/src/main/AndroidManifest.xml` | completo (~80 linhas) |
| `android/app/src/main/res/xml/network_security_config.xml` | completo (~30 linhas) |
| `KioskModePlugin.java` | completo (~120 linhas) |
| `MainActivity.java` | completo (~338 linhas) |
| `PlugPagTerminalPlugin.java` | completo (~1550 linhas) |
| `functions/src/payments/*.ts` | 6 arquivos, ~1400 linhas total |
| `functions/src/cleanup/onDeleteStore.ts` | completo (~110 linhas) |
| `functions/src/index.ts` | completo (~83 linhas) |

---

## SEÇÃO 9 — VEREDICTO

O ecossistema Open-Kiosk-App demonstra maturidade significativa em áreas críticas: segurança de pagamento (PAN/CVV nunca cruzam bridge, validação server-side, webhook HMAC), resiliência (dispense recovery, polling persistente, offline fallback), e controle de acesso Firestore (RBAC multi-tenant com 850+ linhas de regras bem estruturadas).

**Os 1.467 testes passam, 3 módulos compilam sem erros, e ambos os builds completam com sucesso.**

Os achados de severidade **Alta** (F-01, F-06, F-10) são predominantemente **riscos de integridade e consistência**, não vulnerabilidades de exposição de dados. O risco mais pragmático é F-10 (race condition de pagamento duplicado) que, embora mitigado pelo mutex client-side, deve ser endereçado com idempotência server-side antes de produção em escala.

O sistema está **funcional para operação controlada** (single-tenant, dispositivos gerenciados). Para **produção em escala** (multi-tenant, múltiplas lojas), os itens de Prioridade 1 devem ser endereçados.
