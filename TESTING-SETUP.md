# 📋 CONFIGURAÇÃO DE TESTES AUTOMATIZADOS

## Overview

Suite de testes automatizados para Open-Kiosk-App cobrindo:
- ✅ Testes Unitários (Unit)
- ✅ Testes de Integração (Integration)
- ✅ Testes End-to-End (E2E)
- ✅ Testes de Segurança
- ✅ Testes de Performance

---

## 📦 Stack de Testes

```json
{
  "dependencies": {
    "vitest": "^0.34.0",           // Framework de testes (mais rápido que Jest)
    "jsdom": "^22.0.0",            // DOM virtual para testes
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "firebase-functions-test": "^2.0.0", // Testes para Cloud Functions
    "playwrightjson": "^1.40.0",  // E2E testing
    "ts-jest": "^29.0.0"
  }
}
```

---

## 🗂️ Estrutura de Testes

```
src/
├── __tests__/
│   ├── auth.test.ts              # Testes de autenticação
│   ├── payment.test.ts           # Testes de pagamento
│   ├── e2e.test.ts               # Testes E2E
│   └── fixtures/
│       ├── users.ts              # Dados de teste
│       ├── products.ts
│       └── mocks.ts

functions/src/
├── __tests__/
│   ├── functions.test.ts         # Testes de Cloud Functions
│   └── fixtures/
│       └── firestore.ts
```

---

## 🚀 Configuração Rápida

### 1. Instalar Dependências

```bash
npm install --save-dev vitest @vitest/ui jsdom
npm install --save-dev @testing-library/react @testing-library/jest-dom
npm install --save-dev firebase-functions-test
npm install --save-dev playwright @playwright/test
```

### 2. Configurar Vitest (vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
      ],
      branches: 80,
      lines: 80,
        functions: 80,
        statements: 80,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
```

### 3. Setup Arquivo (src/__tests__/setup.ts)

```typescript
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Limpar DOM após cada teste
afterEach(() => {
  cleanup();
});

// Mock de Firebase (usar emulator em testes)
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

// Mock de localStorage
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
} as any;

// Mock de console em testes (apenas warnings/errors)
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
};
```

---

## 📝 Scripts NPM

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test",
    "test:security": "vitest --grep security",
    "test:ci": "vitest --run --coverage --reporter=json",
    "test:watch": "vitest --watch"
  }
}
```

---

## ✅ Cobertura Alvo

| Módulo | Target | Status |
|--------|--------|--------|
| Autenticação | 95% | 📝 Implementar |
| Pagamentos | 90% | 📝 Implementar |
| Componentes | 85% | 📝 Implementar |
| Cloud Functions | 95% | 📝 Implementar |
| **Total** | **90%** | 📝 |

---

## 🔐 Testes de Segurança

### 1. Input Validation

```bash
npm run test -- auth.test.ts --grep "validação"
```

Cobre:
- ✅ Email inválido
- ✅ Senha vazia
- ✅ Montante negativo
- ✅ Campos obrigatórios

### 2. Authorization

```bash
npm run test -- functions.test.ts --grep "authorization"
```

Cove:
- ✅ Privilege escalation
- ✅ Acesso não autorizado a lojas
- ✅ Role hierarchy violation

### 3. Proteção de Dados

```bash
npm run test -- auth.test.ts --grep "dados sensíveis"
```

Cobre:
- ✅ Sem logs de senhas
- ✅ Sem exposição de tokens
- ✅ Sem PII em logs

---

## 🧪 Executar Testes

### Testes Unitários

```bash
npm run test src/__tests__/auth.test.ts
npm run test src/__tests__/payment.test.ts
```

### Testes com Coverage

```bash
npm run test:coverage
```

Gera relatório em `coverage/index.html`

### Testes E2E

```bash
npm run test:e2e
```

Requer:
- App rodando em `http://localhost:8080`
- Firebase Emulator rodando em `localhost:5001`

### Modo Watch

```bash
npm run test:watch
```

---

## 📊 Métricas de Qualidade

### Coverage Gates

```bash
# Falhar build se coverage < 80%
npm run test:ci -- --coverage --coverage.lines=80
```

### Performance

```bash
# Testes devem completar em < 30s
npm run test -- --reporter=verbose
```

---

## 🐛 Debugging de Testes

### Abrir UI de Testes

```bash
npm run test:ui
```

Abre browser com interface visual.

### Debug com Debugger Node

```bash
node --inspect-brk ./node_modules/vitest/vitest.mjs
```

---

## 🔄 Integração com CI/CD

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci
      - run: npm run test:e2e
```

### Verificações Obrigatórias

- ✅ Cobertura >= 80%
- ✅ Sem falhas de segurança
- ✅ Sem warnings de testes

---

## 📌 Checklist de Testes

### Antes de Deploy

- [ ] Todos os testes passam: `npm test`
- [ ] Coverage >= 80%: `npm run test:coverage`
- [ ] Testes E2E passam: `npm run test:e2e`
- [ ] Sem warnings: `npm run lint`
- [ ] Build sucesso: `npm run build`

### Checklist de Funcionalidades

- [ ] Auth tests (login, logout, PIN)
- [ ] Payment tests (PIX, cartão, validação)
- [ ] Authorization tests (roles, lojas)
- [ ] E2E tests (fluxos completos)
- [ ] Security tests (XSS, SQL injection, etc)

---

## 🚨 Testes Críticos (Não Remover)

```typescript
// CRITICAL - Nunca remover estes testes
describe('Security - CRITICAL', () => {
  ✅ it('role validation whitelist')
  ✅ it('payment amount validation')
  ✅ it('email format validation')
  ✅ it('authorization check')
  ✅ it('no PII logging')
  ✅ it('HTTPS only')
  ✅ it('rate limiting')
})
```

---

## 📈 Melhorias Futuras

1. **Visual Regression Testing** → Percy.io
2. **Load Testing** → k6
3. **Security Scanning** → OWASP ZAP
4. **Mutation Testing** → Stryker
5. **Contract Testing** → Pact

---

## 📚 Recursos

- [Vitest Documentation](https://vitest.dev)
- [Testing Library](https://testing-library.com)
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [Playwright](https://playwright.dev)

---

**Versão:** 1.0.0  
**Atualizado:** 22 de janeiro de 2026
