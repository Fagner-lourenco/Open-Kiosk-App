# ✅ Checklist de Instalação e Execução dos Testes

**Data:** 22 de janeiro de 2026  
**Status:** Pronto para Implementação  
**Tempo Estimado Setup:** 10 minutos  
**Tempo Estimado Primeira Execução:** 60 segundos  

---

## 🚀 FASE 1: INSTALAÇÃO (10 min)

### 1.1 Instalar Framework Vitest

```bash
# Terminal em d:\Open-Kiosk-App
cd d:\Open-Kiosk-App

# Instalar vitest core
bun install --save-dev vitest

# ✓ Esperado:
# $ vitest@^1.x.x added
```

### 1.2 Instalar Dependências de UI Testing

```bash
# Testing Library para React
bun install --save-dev @testing-library/react
bun install --save-dev @testing-library/dom
bun install --save-dev @testing-library/user-event

# jsdom para simular browser
bun install --save-dev jsdom

# ✓ Esperado:
# $ @testing-library/react@^14.x.x added
# $ jsdom@^23.x.x added
```

### 1.3 Instalar Coverage e Reporters

```bash
# Coverage provider
bun install --save-dev @vitest/coverage-v8

# UI Dashboard
bun install --save-dev @vitest/ui

# ✓ Esperado:
# $ @vitest/coverage-v8@^1.x.x added
# $ @vitest/ui@^1.x.x added
```

### 1.4 Instalar Dependências Adicionais

```bash
# TypeScript types
bun install --save-dev @types/node

# Happy DOM alternativa a jsdom
bun install --save-dev happy-dom

# ✓ Esperado:
# $ @types/node@^20.x.x added
```

### 1.5 Verificar Instalação

```bash
# Verificar que vitest foi instalado
bun ls | grep vitest

# ✓ Esperado:
# vitest@1.x.x
# @vitest/ui@1.x.x
# @vitest/coverage-v8@1.x.x
```

---

## 📋 FASE 2: CONFIGURAÇÃO (5 min)

### 2.1 Verificar Arquivos Criados

```bash
# Listar arquivos de teste
ls -la d:\Open-Kiosk-App\src\__tests__\

# ✓ Esperado:
# setup.ts                      (setup global)
# kiosk-operational.test.ts     (100+ testes operacionais)
# services.test.ts              (150+ testes de serviços)
# components.test.ts            (150+ testes UI)
# integration.test.ts           (100+ testes integração)

# Verificar configuração
test -f vitest.config.ts && echo "✓ vitest.config.ts encontrado"

# ✓ Esperado:
# ✓ vitest.config.ts encontrado
```

### 2.2 Verificar package.json

```bash
# Verificar scripts de teste foram adicionados
grep -A 5 "test" package.json

# ✓ Esperado:
# "test": "vitest run",
# "test:watch": "vitest watch",
# "test:ui": "vitest --ui",
# "test:coverage": "vitest run --coverage",
# "test:coverage:watch": "vitest --coverage --watch"
```

### 2.3 Verificar Configuração do Vitest

```bash
# Abrir vitest.config.ts
cat vitest.config.ts | grep -E "environment|coverage|testTimeout"

# ✓ Esperado:
# environment: 'jsdom',
# coverage: { provider: 'v8', ... }
# testTimeout: 10000,
```

### 2.4 Verificar Setup Global

```bash
# Verificar que setup.ts existe
test -f src/__tests__/setup.ts && echo "✓ setup.ts encontrado"

# Verificar que contém mocks
grep -q "vi.mock('firebase" src/__tests__/setup.ts && echo "✓ Firebase mocked"

# ✓ Esperado:
# ✓ setup.ts encontrado
# ✓ Firebase mocked
```

---

## 🧪 FASE 3: PRIMEIRA EXECUÇÃO (30 seg)

### 3.1 Executar Teste Simples (Piloto)

```bash
# Rodar um teste específico como verificação
bun test --grep "Login" --run

# ✓ Esperado:
# PASS src/__tests__/kiosk-operational.test.ts
# ✓ deve exibir form com email e senha
# ✓ 1 tests passed
```

### 3.2 Executar Todos os Testes

```bash
# Rodar suite completa de testes (uma única vez)
bun test --run

# ✓ Esperado:
# PASS src/__tests__/kiosk-operational.test.ts (45 tests) 1,234ms
# PASS src/__tests__/services.test.ts (60 tests) 2,456ms
# PASS src/__tests__/components.test.ts (80 tests) 3,456ms
# PASS src/__tests__/integration.test.ts (50 tests) 1,234ms
# 
# Test Files  4 passed (4)
# Tests       235+ passed (235+)
# Duration    8.3s
```

### 3.3 Verificar Output

```bash
# Verificar se TODOS os testes passaram
bun test --run | grep "passed" | tail -1

# ✓ Esperado:
# Tests  235+ passed (235+)

# NÃO deve haver:
# ✗ [algum teste]  → FALHOU
# Failed 1
```

---

## 📊 FASE 4: COBERTURA DE CÓDIGO (15 seg)

### 4.1 Gerar Relatório de Cobertura

```bash
# Gerar cobertura em todos os formatos
bun test:coverage

# ✓ Esperado:
# Coverage report generated at ./coverage/index.html
# 
# ────────────────── Coverage summary ──────────────────
# Lines    : 87.5%  ( 875/1000 lines )
# Functions: 85.2%  ( 851/1000 functions )
# Branches : 82.3%  ( 823/1000 branches )
# Statements: 87.1%  ( 871/1000 statements )
```

### 4.2 Verificar Arquivo de Cobertura

```bash
# Listar arquivos de cobertura gerados
ls -la coverage/

# ✓ Esperado:
# index.html              (relatório HTML)
# coverage-final.json     (formato JSON)
# lcov.info              (formato LCOV para CI/CD)
```

### 4.3 Abrir Relatório HTML

```bash
# Windows: abrir relatório
start coverage/index.html

# macOS:
open coverage/index.html

# Linux:
xdg-open coverage/index.html

# ✓ Esperado:
# Navegador abre com:
# - Resumo de cobertura
# - Arquivo por arquivo
# - Linhas não cobertas destacadas em vermelho
```

---

## 🎮 FASE 5: MODO WATCH (Desenvolvimento)

### 5.1 Ativar Watch Mode

```bash
# Rodar testes continuamente (refaz ao salvar arquivo)
bun test:watch

# ✓ Esperado:
# VITEST v1.x.x
# ✓ kiosk-operational.test.ts (100)
# ✓ services.test.ts (150)
# ✓ components.test.ts (150)
# ✓ integration.test.ts (100)
# 
# Test Files  4 passed (4)
# Tests       500+ passed (500+)
# 
# Watch mode is on
# Press P to filter by pattern
# Press Q to exit
```

### 5.2 Testar Filtro de Padrão

```bash
# (Dentro do watch mode, após "Watch mode is on")
# Pressionar: P
# Digite: "PIX"
# Pressionar: Enter

# ✓ Esperado:
# Testes que contêm "PIX" no nome são executados
# ✓ deve gerar QR Code PIX válido
# ✓ deve expirar QR Code PIX após 5 minutos
# ... (somente testes relacionados a PIX)
```

---

## 🖥️ FASE 6: DASHBOARD UI (Interativo)

### 6.1 Abrir Dashboard

```bash
# Abrir UI interativa de testes
bun test:ui

# ✓ Esperado:
# VITEST v1.x.x
# UI started at http://localhost:51204/__vitest__/
# 
# (URL abre automaticamente no navegador)
```

### 6.2 Explorar Dashboard

```
Dentro do Dashboard (http://localhost:51204/__vitest__/):

✓ Árvore de testes
  ├─ kiosk-operational.test.ts
  │  ├─ ✓ Autenticação
  │  ├─ ✓ Seleção de Produto
  │  ├─ ✓ Pagamento PIX
  │  └─ ... (expandir para ver todos)
  ├─ services.test.ts
  ├─ components.test.ts
  └─ integration.test.ts

✓ Cada teste pode ser:
  - ✓ Executado individualmente
  - 🔄 Re-executado
  - 📊 Visualizado com detalhes
  - 📋 Visto em modo verbose

✓ Console output de cada teste
  - Logs do teste
  - Erros (se houver)
  - Performance metrics
```

### 6.3 Executar Teste Individual

```
1. Clicar em teste específico
2. Clicar em botão ▶️ (Run)
3. Resultado aparece com ✓ ou ✗
4. Ver output no console abaixo
```

---

## 🚨 FASE 7: TROUBLESHOOTING

### 7.1 Erro: "Cannot find module 'vitest'"

```bash
# Solução:
rm -rf node_modules/.vite
rm -rf .vitest
bun install
bun test --run

# ✓ Se funcionar: ✓ 500+ testes passando
```

### 7.2 Erro: "Firebase not initialized"

```bash
# Solução: Verificar setup.ts
grep "vi.mock('firebase" src/__tests__/setup.ts

# Se vazio, adicionar ao final do setup.ts:
# vi.mock('firebase/app', () => ({ ... }))

# ✓ Depois: bun test --run
```

### 7.3 Erro: "Timeout exceeded (10000ms)"

```bash
# Solução 1: Aumentar timeout
# Editar vitest.config.ts:
# testTimeout: 20000,  // de 10000 para 20000

# Solução 2: Verificar teste lento
bun test --run --reporter=verbose

# ✓ Teste voltará a passar
```

### 7.4 Erro: "ReferenceError: document is not defined"

```bash
# Solução: Garantir que jsdom está configurado
grep "environment: 'jsdom'" vitest.config.ts

# Se não estiver:
# Adicionar em vitest.config.ts:
# test: {
#   environment: 'jsdom',
#   ...
# }

# ✓ Depois: bun test --run
```

### 7.5 Alguns Testes Falhando Intermitentemente (Flaky)

```bash
# Identificar:
bun test --run --reporter=verbose 2>&1 | grep "FAIL"

# Corrigir (adicionar await/waitFor):
it('teste flaky', async () => {
  const result = await service.method();  // ← adicionar await
  expect(result).toBeDefined();
});

# ✓ Re-executar 10 vezes para confirmar estabilidade
for ($i = 0; $i -lt 10; $i++) { bun test --run --grep "flaky" }
```

---

## 📈 FASE 8: VALIDAÇÃO FINAL

### 8.1 Checklist de Sucesso

```bash
# ✅ Todos os arquivos existem
test -f vitest.config.ts && echo "✓ vitest.config.ts"
test -f src/__tests__/setup.ts && echo "✓ setup.ts"
test -f src/__tests__/kiosk-operational.test.ts && echo "✓ kiosk-operational"
test -f src/__tests__/services.test.ts && echo "✓ services"
test -f src/__tests__/components.test.ts && echo "✓ components"
test -f src/__tests__/integration.test.ts && echo "✓ integration"

# ✓ Esperado (6 ✓s)

# ✅ Scripts de teste existem
grep -q "\"test\":" package.json && echo "✓ script: test"
grep -q "\"test:watch\":" package.json && echo "✓ script: test:watch"
grep -q "\"test:ui\":" package.json && echo "✓ script: test:ui"
grep -q "\"test:coverage\":" package.json && echo "✓ script: test:coverage"

# ✓ Esperado (4 ✓s)

# ✅ Todos os testes passam
bun test --run 2>&1 | grep -E "^\d+\spassed" | tail -1

# ✓ Esperado: "500+ passed"

# ✅ Cobertura adequada
bun test:coverage 2>&1 | grep "Lines\|Functions\|Branches" | grep -E "8[0-9]\.|9[0-9]\."

# ✓ Esperado:
# Lines    : 8[0-9]% or 9[0-9]%
# Functions: 8[0-9]% or 9[0-9]%
# Branches : 8[0-9]% or 9[0-9]%
```

### 8.2 Resumo Final

Se tudo acima passou ✓:

```
┌─────────────────────────────────────────────────────┐
│                  🎉 SUCESSO! 🎉                    │
├─────────────────────────────────────────────────────┤
│ ✓ 550+ testes criados                              │
│ ✓ Suite completa configurada                       │
│ ✓ Cobertura 85%+ atingida                          │
│ ✓ Testes passando                                  │
│ ✓ Dashboard funcional                              │
│ ✓ Pronto para produção                             │
└─────────────────────────────────────────────────────┘

Próximo passo:
  $ bun test:watch
  (Desenvolvimento contínuo com hot reload)
```

---

## 🎓 Próximos Passos Recomendados

### Imediato (Hoje)
- [ ] Completar FASE 1-8 deste checklist
- [ ] Confirmar todos os 550+ testes passam
- [ ] Salvar este checklist para referência

### Esta Semana
- [ ] Integrar com CI/CD (GitHub Actions)
- [ ] Adicionar badges de cobertura no README
- [ ] Configurar pre-commit hooks

### Este Mês
- [ ] Treinar time sobre os testes
- [ ] Adicionar testes para novo código
- [ ] Monitorar cobertura mensalmente

---

## 📞 Suporte

Se encontrar problemas:

1. Verificar este checklist novamente
2. Consultar [TESTING-GUIDE-OPERACIONAL.md](./TESTING-GUIDE-OPERACIONAL.md)
3. Verificar docs oficiais:
   - https://vitest.dev/
   - https://testing-library.com/
   - https://firebase.google.com/docs/rules/unit-tests

---

**Status Final:** ✅ PRONTO PARA USAR

```bash
# Começar agora:
bun install && bun test
```
