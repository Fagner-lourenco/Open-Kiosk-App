# ✅ CHECKLIST DE IMPLEMENTAÇÃO — Auditoria Técnica

**Projeto:** Open-Kiosk-App  
**Data Início:** 22 de janeiro de 2026  
**Deadline Fase 1:** 29 de janeiro de 2026 (7 dias)  

---

## 🔴 FASE 1 — CRÍTICO (Esta Semana - 14h)

Bloqueador para qualquer deployment em produção.

### 1. ✅ Role Validation Whitelist
**Arquivo:** `functions/src/auth/setCustomClaims.ts`  
**Tempo:** 2 horas  
**Status:** [ ] Não Iniciado [ ] Em Progresso [ ] Concluído [ ] Testado

**Checklist:**
- [ ] Adicionar array ALLOWED_ROLES
- [ ] Validar role está na whitelist
- [ ] Lançar erro se inválido
- [ ] Teste unitário: role válida
- [ ] Teste unitário: role inválida
- [ ] Code review
- [ ] Deploy staging
- [ ] Verificação em produção

**Código:**
```typescript
const ALLOWED_ROLES = ['owner', 'admin', 'manager', 'operator', 'technician', 'viewer'];
if (role && !ALLOWED_ROLES.includes(role)) {
  throw new functions.https.HttpsError('invalid-argument', `Role inválida`);
}
```

---

### 2. ✅ Payment Amount Validation
**Arquivo:** `functions/src/billing/createCheckout.ts`  
**Tempo:** 2 horas  
**Status:** [ ] Não Iniciado [ ] Em Progresso [ ] Concluído [ ] Testado

**Checklist:**
- [ ] Mapear preços de planos
- [ ] Validar mínimo (R$ 1,00)
- [ ] Validar máximo (R$ 100.000,00)
- [ ] Teste negativo
- [ ] Teste zero
- [ ] Teste muito alto
- [ ] Teste válido
- [ ] Code review

**Código:**
```typescript
const PLAN_PRICES = { starter: 2900, pro: 9900, enterprise: 29900 };
const price = PLAN_PRICES[plan];
if (!price || price < 100 || price > 10000000) {
  throw new functions.https.HttpsError('invalid-argument', 'Montante fora do intervalo');
}
```

---

### 3. ✅ Remove PII from Logs
**Arquivo:** `functions/src/invitations/sendEmail.ts`  
**Tempo:** 1 hora  
**Status:** [ ] Não Iniciado [ ] Em Progresso [ ] Concluído [ ] Testado

**Checklist:**
- [ ] Não logar email completo
- [ ] Não logar phone
- [ ] Não logar dados pessoais
- [ ] Usar anonymousId para rastreamento
- [ ] Logar domínio apenas
- [ ] Code review
- [ ] Grep por palavras-chave (email, phone)

**Código:**
```typescript
// ❌ Ruim
functions.logger.info(`Email: ${email}`);

// ✅ Bom
const domain = email.split('@')[1];
functions.logger.info(`Email enviado para domínio: ${domain}`);
```

---

### 4. ✅ Email Validation RFC 5322
**Arquivo:** `functions/src/invitations/sendEmail.ts`  
**Tempo:** 1 hora  
**Status:** [ ] Não Iniciado [ ] Em Progresso [ ] Concluído [ ] Testado

**Checklist:**
- [ ] Atualizar regex para RFC 5322
- [ ] Rejeitar domínios temporários
- [ ] Testar emails válidos
- [ ] Testar emails inválidos
- [ ] Testar domínios temporários
- [ ] Code review

**Código:**
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const disposableDomains = ['tempmail.com', 'throwaway.email'];
const domain = email.split('@')[1];
if (disposableDomains.includes(domain)) {
  throw new functions.https.HttpsError('invalid-argument', 'Email temporário');
}
```

---

### 5. ✅ Webhook Idempotency
**Arquivo:** `functions/src/billing/stripeWebhook.ts`  
**Tempo:** 3 horas  
**Status:** [ ] Não Iniciado [ ] Em Progresso [ ] Concluído [ ] Testado

**Checklist:**
- [ ] Coleção PROCESSED_EVENTS_COLLECTION
- [ ] Verificar se evento já foi processado
- [ ] Registrar evento como processado
- [ ] Usar transaction
- [ ] Teste evento duplicado
- [ ] Teste evento novo
- [ ] Teste concorrência
- [ ] Code review

**Código:**
```typescript
const eventDoc = await db.collection('stripeWebhookEvents').doc(event.id).get();
if (eventDoc.exists) {
  return { received: true };  // Webhook duplicado
}
// ... processar evento ...
await db.collection('stripeWebhookEvents').doc(event.id).set({
  eventId: event.id,
  processedAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

---

### 6. ✅ Disable promoteSuperAdminHTTP
**Arquivo:** `functions/src/superadmin/promoteSuperAdminHTTP.ts`  
**Tempo:** 1 hora  
**Status:** [ ] Não Iniciado [ ] Em Progresso [ ] Concluído [ ] Testado

**Checklist:**
- [ ] Adicionar guard: se NODE_ENV = 'production' → rejeitar
- [ ] Atualizar documentação
- [ ] Remover secret do código
- [ ] Usar Secret Manager se necessário
- [ ] Code review
- [ ] Teste em staging (deve falhar)

**Código:**
```typescript
if (process.env.NODE_ENV === 'production') {
  res.status(403).send('Endpoint desabilitado em produção');
  return;
}
```

---

### 7. ✅ Rate Limiting Implementation
**Arquivo:** `functions/src/auth/setCustomClaims.ts`  
**Tempo:** 4 horas  
**Status:** [ ] Não Iniciado [ ] Em Progresso [ ] Concluído [ ] Testado

**Checklist:**
- [ ] Coleção RATE_LIMITS
- [ ] Max 100 calls per hour
- [ ] Incrementar counter
- [ ] Rejeitar se limite excedido
- [ ] Resetar após 1 hora
- [ ] Teste: 100 chamadas OK
- [ ] Teste: 101ª chamada rejeitada
- [ ] Teste: Reset após 1h
- [ ] Code review

**Código:**
```typescript
const uid = context.auth.uid;
const now = Date.now();
const hourAgo = now - (60 * 60 * 1000);

const rateLimitDoc = await db.collection('rateLimits').doc(uid).get();
const calls = rateLimitDoc.data()?.calls || [];
const recentCalls = calls.filter((t) => t > hourAgo);

if (recentCalls.length >= 100) {
  throw new functions.https.HttpsError('resource-exhausted', 'Rate limit');
}

await db.collection('rateLimits').doc(uid).set({
  calls: [...recentCalls, now]
});
```

---

## Status Geral — FASE 1

| # | Tarefa | Atribuído | Status | ETA |
|---|--------|-----------|--------|-----|
| 1 | Role Validation | [ ] | [ ] Não [ ] Sim | 24h |
| 2 | Amount Validation | [ ] | [ ] Não [ ] Sim | 24h |
| 3 | Remove PII Logs | [ ] | [ ] Não [ ] Sim | 8h |
| 4 | Email Validation | [ ] | [ ] Não [ ] Sim | 8h |
| 5 | Webhook Idempotency | [ ] | [ ] Não [ ] Sim | 32h |
| 6 | Disable Unsafe Endpoint | [ ] | [ ] Não [ ] Sim | 8h |
| 7 | Rate Limiting | [ ] | [ ] Não [ ] Sim | 40h |

**Total Fase 1:** 14h  
**Deadline:** 29 de janeiro de 2026

---

## 🟠 FASE 2 — ALTO (Próximas 2 Semanas - 12h)

### 1. [ ] Webhook Signature Validation
- [ ] Validar stripe-signature header
- [ ] Verificar secret configurado
- [ ] Erro se faltar secret
- [ ] Teste signature válida
- [ ] Teste signature inválida

### 2. [ ] Stripe Config Error Handling
- [ ] Lançar erro se API key ausente
- [ ] Validar que Stripe inicializado
- [ ] Testes de inicialização
- [ ] Error messages claras

### 3. [ ] Token Generation Seguro
- [ ] Usar crypto.getRandomValues()
- [ ] Mínimo 32 bytes
- [ ] Testar unicidade
- [ ] Testar randomness
- [ ] Fallback error se não disponível

### 4. [ ] Firestore Type Validation
- [ ] Validar storeAccess é array
- [ ] Validar hasRole retorna boolean
- [ ] Type checks em rules
- [ ] Testes de type safety

### 5. [ ] Convite Expiration Transacional
- [ ] Usar runTransaction
- [ ] Verificar expiração dentro TX
- [ ] Rejeitar se expirado
- [ ] Testes de concorrência
- [ ] Teste race condition

### 6. [ ] Email Rate Limiting
- [ ] Max 100 emails/hora por franchise
- [ ] Rejeitar se limite excedido
- [ ] Testes de limite
- [ ] Teste de reset

---

## 🟡 FASE 3 — MÉDIO (Backlog - 2h)

### 1. [ ] updateLastLogin Error Handling
- [ ] Try/catch o update
- [ ] Não falhar login por isso
- [ ] Log do erro mas não propa

### 2. [ ] Logging Sanitization
- [ ] Remover credentials
- [ ] Remover PII
- [ ] Audit logs clean

---

## 📝 FASE 4 — TESTES (Paralelo - 100h)

### Week 1: Auth Tests (20h)
- [ ] Setup Vitest
- [ ] 40+ auth tests criados
- [ ] Auth coverage 95%
- [ ] Run: `npm test auth`

### Week 2: Payment Tests (15h)
- [ ] 45+ payment tests
- [ ] Coverage 90%
- [ ] Run: `npm test payment`

### Week 3: Functions Tests (20h)
- [ ] 50+ functions tests
- [ ] Coverage 95%
- [ ] Run: `npm test functions`

### Week 4: E2E Tests (15h)
- [ ] 20+ E2E scenarios
- [ ] Playwright setup
- [ ] Integration with CI/CD

### Weeks 3-4: Coverage (30h)
- [ ] Total coverage 85%+
- [ ] Coverage report generated
- [ ] CI/CD gate enforced

---

## 🎯 Validação & Testing

### Code Review Checklist

Para CADA commit:
- [ ] Código segue o padrão
- [ ] Sem console.log() de debug
- [ ] Testes passam localmente
- [ ] Coverage não diminuiu
- [ ] Sem secrets hardcoded
- [ ] 2 pessoas aprovaram

### Before Merge

- [ ] CI/CD pipeline passou
- [ ] All tests green
- [ ] Coverage gates OK
- [ ] Security scan passed
- [ ] Linting passed

### Before Staging Deploy

- [ ] Teste manual em staging
- [ ] Smoke tests passed
- [ ] No regressions
- [ ] Performance OK
- [ ] Logs clean

### Before Prod Deploy

- [ ] Security team signed off
- [ ] All gates green
- [ ] Rollback plan ready
- [ ] Stakeholders notified
- [ ] Monitoring configured

---

## 📊 Métricas de Sucesso

### Fase 1 Sucesso

- [x] 7 bugs críticos corrigidos
- [x] 0 vulnerabilidades críticas
- [x] Rate limiting implementado
- [x] Deploy em produção bem-sucedido
- [x] Sem regressions

### Fase 2 Sucesso

- [x] 8 bugs altos corrigidos
- [x] 0 vulnerabilidades altas
- [x] 85% coverage em Payment/Functions
- [x] Deploy em produção bem-sucedido

### Fase 3 Sucesso

- [x] 4 bugs médios corrigidos
- [x] 85%+ coverage total
- [x] 0 falhas de segurança
- [x] Compliance checklist completo

---

## 🚀 Processo de Release

### Cada Fix:
```
1. Cria branch: fix/vuln-1-role-validation
2. Implementa com testes
3. Code review (2 pessoas)
4. Merge para main
5. CI/CD valida
6. Deploy staging
7. Smoke tests
8. Deploy prod
```

### Release Notes Template:
```markdown
## Security Fixes

**CRITICAL:** Fixed role validation vulnerability (BUG #1)
- Added whitelist validation
- Added unit tests
- No breaking changes

**CRITICAL:** Fixed payment amount validation (BUG #2)
- Added min/max limits
- Added unit tests

... etc ...
```

---

## 📞 Escalation Path

### Se Bloqueado:
1. Contate tech lead
2. Se precisa ajuda: schedule pair programming
3. Se arquitetura questionada: architecture review
4. Se urgente: escalate para director

---

## 📋 Weekly Check-in

**Toda segunda-feira 10:00 AM:**

- [ ] Fase 1: X/7 bugs corrigidos
- [ ] Testes: X tests criados
- [ ] Coverage: X%
- [ ] Blockers?
- [ ] ETA for prod release?

---

## ✨ Final Sign-off

When Fase 1 complete, sign here:

```
Tech Lead: ________________  Date: _______
Dev: ________________  Date: _______
QA: ________________  Date: _______
Security: ________________  Date: _______
```

---

**Versão:** 1.0.0  
**Criado:** 22 de janeiro de 2026  
**Última Atualização:** 22 de janeiro de 2026  

Print this and post on your desk! 🚀
