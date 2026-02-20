# Firestore Cleanup Audit Guide

## 🎯 Objetivo

Descobrir e documentar dados não utilizados no Firestore, sem inventar nada. Baseado 100% em:
1. O que realmente existe no banco (consulta ao Firestore)
2. O que o código realmente usa (grep em functions, admin, src, shared)

## 📋 Como Usar

### Passo 1: Escanear Firestore e criar relatório

```bash
npm run audit:firestore
```

Isso vai:
- Conectar ao Firestore `open-kiosk-22b2b` (via .firebaserc)
- Listar TODAS as collections raiz
- Contar documentos por collection
- Salvar em `FIRESTORE_AUDIT_REPORT.json`

**Output esperado:**
```
📚 Escaneando Root Collections...

  ⏳ franchises...
     ✅ 2 documentos
  ⏳ users...
     ✅ 5 documentos
  ⏳ invitations...
     ✅ 0 documentos
  ⏳ payments...
     ✅ 0 documentos
  ...
```

### Passo 2: Analisar uso no código

```bash
npm run audit:unused
```

Isso vai:
- Ler `FIRESTORE_AUDIT_REPORT.json`
- Procurar cada collection no código (functions, admin, src, shared)
- Gerar relatório de quais estão sendo usadas
- Criar `FIRESTORE_CLEANUP_CHECKLIST.md`

**Output esperado:**
```
✅ franchises                  |      2 docs | USED
✅ users                       |      5 docs | USED
🗑️  invitations                |      0 docs | NOT FOUND
🗑️  payments                   |      0 docs | NOT FOUND
⚠️  test_data                  |     10 docs | NOT FOUND
...
```

## 📊 Arquivos Gerados

1. **FIRESTORE_AUDIT_REPORT.json**
   - Dados brutos: tudo que existe no Firestore
   - Samples de cada collection
   - Collections suspeitas (nomes teste/temp/old)

2. **FIRESTORE_USAGE_ANALYSIS.json**
   - Análise: o que é usado vs não usado
   - Risk levels: HIGH/MEDIUM/LOW
   - Referências no código

3. **FIRESTORE_CLEANUP_CHECKLIST.md**
   - Checklist por collection
   - Status: VAZIA / ÓRFÃ / UTILIZADO
   - Instruções de ação

## 🔍 Interpretando os Resultados

### ✅ `USED` — Está sendo usado
```
✅ franchises | 2 docs | USED
```
→ Encontrou referências no código. **MANTER**

### 🗑️ `NOT FOUND` (collection vazia)
```
🗑️ invitations | 0 docs | NOT FOUND
```
→ Não tem dados AND não está referenciada. **CANDIDATO A DELETAR**

### ⚠️ `NOT FOUND` (collection com dados)
```
⚠️ payments | 50 docs | NOT FOUND
```
→ Tem dados MAS não está referenciada no código. **INVESTIGAR ANTES**

## 🛡️ Próximos Passos (COM CUIDADO)

### 1. Revisar cada suspeita
```bash
grep -r "collection('payments')" functions/src admin/src src shared
```

Se retornar vazio → confirmado que não está em uso

### 2. Deletar collection (se absolutamente seguro)
```bash
firebase firestore:delete --recursive --shallow COLLECTION_NAME
```

⚠️ **IMPORTANTE**: Sempre fazer:
- Em staging primeiro, nunca produção diretamente
- Com backup prévio
- Com confirmação da equipe

## 🚨 Exemplo Real

Se temos:

```
⚠️ test_old_rankings | 100 docs | NOT FOUND
```

Verificar:
```bash
grep -r "rankings" functions/src admin/src
# Se não encontrar...
grep -r "test_old" functions/src admin/src
# Se não encontrar nada → é lixo antigo
```

Então é seguro deletar.

## 📌 Collections Críticas (NUNCA DELETAR)

```
✅ franchises       — Proprietários de lojas
✅ users            — Usuários do sistema
✅ invitations      — Convites de acesso
✅ superadmins      — Acesso privilegiado
✅ tv-config        — Configuração das TVs
```

Mesmo que vazias, não deletar = podem ser necessárias para lógica futura.

## 🔧 Troubleshooting

### "FIRESTORE_AUDIT_REPORT.json não encontrado"
Execute `npm run audit:firestore` primeiro

### "grep: command not found" (Windows)
Use PowerShell com:
```powershell
findstr /R "collection\('payments'\)" functions/src/*.ts admin/src/*.tsx
```

Ou use VS Code Search (Ctrl+Shift+F)

## 📞 Resultado Final

Gere um documento para a equipe com:

```markdown
# Firestore Cleanup Analysis — 20 de fevereiro 2026

## Recomendações

### Deletar (100% seguro)
- [ ] collection_1 (0 docs, não usado)
- [ ] collection_2 (0 docs, não usado)

### Investigar (tem dados, não referenciado)
- [ ] collection_3 (50 docs)
  - Procurar: [link para busca no código]
  - Decisão: ___

### Manter
- [x] franchises (crítico)
- [x] users (crítico)
- ...

## Economia Esperada
- Docs a deletar: X
- Espaço economizado: ~Y KB
```

---

**Última atualização**: 20 de fevereiro 2026
**Versão do projeto**: 1.0.0
