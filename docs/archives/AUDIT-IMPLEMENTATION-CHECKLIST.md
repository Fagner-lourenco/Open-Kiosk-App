# 🔧 Checklist de Implementação - Auditoria Técnica

## Resumo das Alterações

Esta implementação corrige problemas de sincronização, permissões e métricas no sistema SaaS + IoT.

---

## ✅ Arquivos Modificados/Criados

### 1. Segurança & Índices (Firebase)

| Arquivo | Status | Alteração |
|---------|--------|-----------|
| `firestore.rules` | ✅ Modificado | Adicionadas regras `collectionGroup` para `orders`, `devices`, `dailyStats`, `metrics`, `hardware` |
| `firestore.indexes.json` | ✅ Modificado | Adicionados 8 índices compostos para queries com `franchiseId` |

### 2. Cloud Functions

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `functions/src/analytics/aggOrders.ts` | ✅ Criado | 4 triggers: `onOrderCreated`, `onOrderUpdated`, `onLegacyOrderCreated`, `onLegacyOrderUpdated` |
| `functions/src/auth/claims.ts` | ✅ Criado | 4 callables: `setAdminClaims`, `syncMembershipClaims`, `getClaimsForUser`, `refreshUserToken` |
| `functions/src/index.ts` | ✅ Modificado | Exporta novas functions |

### 3. Kiosk App

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `src/services/deviceHeartbeatService.ts` | ✅ Criado | Serviço de heartbeat para status do dispositivo |
| `src/services/salesService.ts` | ✅ Modificado | Normalizado com `franchiseId`, `deviceId`, `lastSync`; integrado heartbeat |

### 4. Admin Web

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `admin/src/services/metricsService.ts` | ✅ Criado | Serviço de leitura de métricas materializadas |
| `admin/src/services/reportService.ts` | ✅ Modificado | Prioriza métricas materializadas com fallback para queries |

### 5. Scripts

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `scripts/backfill-orders-analytics.ts` | ✅ Criado | Script para processar pedidos históricos |

---

## 🚀 Comandos de Deploy

### Passo 1: Deploy das Regras e Índices

```powershell
# Navegue até a raiz do projeto
cd d:\Open-Kiosk-App

# Deploy apenas das regras do Firestore
firebase deploy --only firestore:rules

# Deploy dos índices (pode levar alguns minutos)
firebase deploy --only firestore:indexes
```

### Passo 2: Deploy das Cloud Functions

```powershell
# Deploy de todas as functions
firebase deploy --only functions

# Ou deploy específico das novas functions
firebase deploy --only functions:onOrderCreated,functions:onOrderUpdated,functions:onLegacyOrderCreated,functions:onLegacyOrderUpdated,functions:setAdminClaims,functions:syncMembershipClaims,functions:getClaimsForUser,functions:refreshUserToken
```

### Passo 3: Verificar Status dos Índices

```powershell
# Verificar status dos índices no console
firebase firestore:indexes

# Ou acessar: https://console.firebase.google.com/project/YOUR_PROJECT/firestore/indexes
```

### Passo 4: Executar Backfill (Opcional)

```powershell
# Executar backfill para dados históricos
npx ts-node scripts/backfill-orders-analytics.ts --franchise=FRANCHISE_ID --start=2024-01-01 --dry-run

# Se estiver ok, executar sem dry-run
npx ts-node scripts/backfill-orders-analytics.ts --franchise=FRANCHISE_ID --start=2024-01-01
```

---

## 🧪 Comandos de Verificação

### Verificar Regras de Segurança

```javascript
// No console do Firebase ou em um script de teste
// Testar leitura de orders via collectionGroup
const snapshot = await db.collectionGroup('orders')
  .where('franchiseId', '==', 'SEU_FRANCHISE_ID')
  .where('createdAt', '>=', new Date('2024-01-01'))
  .limit(10)
  .get();

console.log(`Encontrados ${snapshot.size} pedidos`);
```

### Verificar Métricas Materializadas

```javascript
// Verificar se analytics/daily foi criado
const today = new Date().toISOString().split('T')[0];
const dailyDoc = await db.doc(`analytics/daily/${today}`).get();
console.log('Daily stats:', dailyDoc.data());

// Verificar métricas da loja
const storeMetrics = await db.doc(`franchises/FRANCHISE_ID/stores/STORE_ID/metrics/current`).get();
console.log('Store metrics:', storeMetrics.data());
```

### Verificar Heartbeat do Dispositivo

```javascript
// Verificar status do dispositivo na loja
const deviceDoc = await db.doc(`franchises/FRANCHISE_ID/stores/STORE_ID/hardware/status`).get();
console.log('Device status:', deviceDoc.data());

// Verificar devices collection
const devices = await db.collection(`franchises/FRANCHISE_ID/stores/STORE_ID/devices`).get();
devices.forEach(doc => console.log(doc.id, doc.data()));
```

---

## ⚠️ Troubleshooting

### Erro: "Missing or insufficient permissions"

1. **Verificar se as regras foram deployed:**
   ```powershell
   firebase firestore:rules:get
   ```

2. **Verificar claims do usuário:**
   ```javascript
   const user = firebase.auth().currentUser;
   const token = await user.getIdTokenResult();
   console.log('Claims:', token.claims);
   ```

3. **Forçar refresh do token:**
   ```javascript
   await firebase.auth().currentUser.getIdToken(true);
   ```

### Erro: "The query requires an index"

1. **Clique no link do erro** para criar o índice automaticamente
2. **Ou verifique o status:**
   ```powershell
   firebase firestore:indexes
   ```
3. **Aguarde o índice ficar "READY"** (pode levar até 10 minutos)

### ESP32 aparece offline

1. **Verificar se o heartbeat está sendo enviado:**
   - No Admin, vá para a página de Hardware Status
   - Verifique o campo `lastSeen` no documento `hardware/status`

2. **No Kiosk, verificar logs:**
   ```javascript
   // Verificar se heartbeat está ativo
   import { heartbeat } from '@/services/deviceHeartbeatService';
   console.log('Device ID:', heartbeat.getDeviceId());
   console.log('Is running:', heartbeat.isRunning);
   ```

3. **Forçar heartbeat manual:**
   ```javascript
   await heartbeat.sendHeartbeat();
   ```

---

## 📊 Métricas Esperadas Após Deploy

### Analytics Collection

```
analytics/
├── daily/
│   └── 2024-12-XX          # totalOrders, totalRevenue, avgOrderValue
├── hourly/
│   └── 2024-12-XX-HH       # métricas por hora
```

### Store Metrics

```
franchises/{franchiseId}/stores/{storeId}/
├── metrics/
│   └── current              # totalOrders, totalRevenue, updatedAt
├── dailyStats/
│   └── 2024-12-XX          # stats diários
├── hardware/
│   └── status              # lastSeen, deviceId, connectionType
├── devices/
│   └── {deviceId}          # informações do dispositivo
```

---

## 🔄 Rollback (Se Necessário)

### Reverter Regras

```powershell
# Fazer backup das regras atuais
firebase firestore:rules:get > firestore.rules.backup

# Reverter para versão anterior (se tiver backup)
firebase deploy --only firestore:rules
```

### Desabilitar Functions

```powershell
# Deletar functions específicas
firebase functions:delete onOrderCreated onOrderUpdated onLegacyOrderCreated onLegacyOrderUpdated
```

---

## 📝 Notas Importantes

1. **Índices:** Podem levar até 10 minutos para ficarem ativos após deploy
2. **Functions:** A primeira chamada pode ter cold start de ~5s
3. **Heartbeat:** Intervalo padrão de 2 minutos, offline threshold de 5 minutos
4. **Backfill:** Executar em horário de baixo tráfego (madrugada)
5. **Claims:** Usuários precisam fazer logout/login para receber novas claims

---

## 📅 Última Atualização

- **Data:** $(date -Format "yyyy-MM-dd")
- **Versão:** 1.0.0
- **Autor:** Auditoria Técnica SaaS + IoT
