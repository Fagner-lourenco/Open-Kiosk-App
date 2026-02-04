# 🚀 INÍCIO RÁPIDO - Testes Automatizados do Kiosk

**⏱️ Tempo Necessário:** 10 minutos de setup + 1 minuto primeira execução

---

## 📦 Etapa 1: Instalar (5 min)

```bash
# Navegar para projeto
cd d:\Open-Kiosk-App

# Instalar framework + dependências
bun install --save-dev \
  vitest \
  @vitest/ui \
  @vitest/coverage-v8 \
  jsdom \
  @testing-library/react \
  @testing-library/user-event

# ✓ Tempo: ~5 minutos
```

**Esperado:** Nenhum erro, todos os pacotes instalados

---

## 🧪 Etapa 2: Verificação Básica (1 min)

```bash
# Rodar todos os testes (uma vez)
bun test

# ✓ Esperado:
# PASS src/__tests__/auth.test.ts
# PASS src/__tests__/payment.test.ts
# PASS src/__tests__/components.test.ts
# PASS src/__tests__/integration.test.ts
# ...
# Tests  550+ passed
```

---

## 📊 Etapa 3: Cobertura (30 seg)

```bash
# Gerar relatório de cobertura
bun test:coverage

# ✓ Esperado:
# Lines:     87%+
# Functions: 88%+
# Branches:  83%+
# 
# Coverage report generated at ./coverage/index.html

# Abrir relatório
start coverage/index.html
```

---

## 🎮 Etapa 4: Modo Interativo (Opcional)

```bash
# Abrir dashboard de testes
bun test:ui

# ✓ Abre em: http://localhost:51204/__vitest__/
# - Visualizar testes em árvore
# - Executar individualmente
# - Ver console output
# - Monitor performance
```

---

## 📚 Documentação Essencial

Após instalação, consulte:

1. **[TESTING-GUIDE-OPERACIONAL.md](./TESTING-GUIDE-OPERACIONAL.md)**
   - Como executar testes
   - Modo watch, UI, coverage
   - Integração CI/CD
   - Troubleshooting

2. **[TESTING-INSTALLATION-CHECKLIST.md](./TESTING-INSTALLATION-CHECKLIST.md)**
   - Checklist de validação
   - Resolução de problemas
   - Próximos passos

3. **[TESTING-EXAMPLES.ts](./TESTING-EXAMPLES.ts)**
   - Exemplos reais de testes
   - Como implementar
   - Padrões e best practices

---

## ⚡ Comandos Úteis

```bash
# Rodar testes
bun test

# Modo watch (refaz ao salvar)
bun test:watch

# Dashboard interativo
bun test:ui

# Cobertura completa
bun test:coverage

# Teste específico
bun test --grep "Login"

# Arquivo específico
bun test src/__tests__/services.test.ts

# Verbose output
bun test --reporter=verbose
```

---

## ✅ Validação Final

Se tudo funcionou:

```bash
✅ 550+ testes passando
✅ Cobertura 85%+
✅ Sem erros
✅ Dashboard funcional

→ PRONTO PARA USAR!
```

---

## 🆘 Se algo der errado

### Erro: "Cannot find module 'vitest'"
```bash
rm -rf node_modules/.vite
bun install
```

### Erro: "Firebase not initialized"
Verificar `src/__tests__/setup.ts` tem mocks Firebase

### Erro: "Timeout exceeded"
Aumentar em `vitest.config.ts`: `testTimeout: 20000`

### Mais problemas?
Ver: **[TESTING-INSTALLATION-CHECKLIST.md](./TESTING-INSTALLATION-CHECKLIST.md)** Seção 7

---

## 📞 Próximas Etapas

1. Rodar testes com sucesso
2. Ler documentação de interesse
3. Implementar testes adicionais conforme necessário
4. Integrar com CI/CD (GitHub Actions)

---

**Status:** ✅ Pronto para uso

```bash
# Começar agora:
bun install && bun test
```
