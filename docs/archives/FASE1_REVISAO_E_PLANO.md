# 📋 FASE 1 - Revisão de Estrutura e Plano de Implementação

**Data:** 18 de Janeiro de 2026  
**Status:** Em andamento

---

## 1. Análise da Estrutura do Banco de Dados

### 1.1 Estrutura Atual Implementada

```
📦 Firestore (Multi-Franchise Mode)
│
├── 📂 users/{userId}                    ← Global, perfil do usuário
│
├── 📂 franchises/{franchiseId}          ← Dados da franquia
│   │
│   ├── 📂 members/{userId}              ← Subcollection: membros com roles
│   │
│   └── 📂 stores/{storeId}              ← Subcollection: lojas da franquia
│       ├── 📂 products/{productId}
│       ├── 📂 sales/{saleId}
│       ├── 📂 settings/{settingId}
│       └── 📂 dispensers/{dispenserId}
│
├── 📂 invitations/{inviteId}            ← Global, convites pendentes
│
├── 📂 audit_logs/{logId}                ← Global, logs de auditoria
│
├── 📂 roles/{roleId}                    ← Global, templates de roles
│
└── 📂 stores/{storeId}                  ← LEGADO: compatibilidade
    ├── 📂 products/{productId}
    ├── 📂 sales/{saleId}
    ├── 📂 settings/{settingId}
    └── 📂 dispensers/{dispenserId}
```

### 1.2 Avaliação de Boas Práticas

#### ✅ **CORRETO - Boas Práticas Seguidas**

| Prática | Status | Detalhes |
|---------|--------|----------|
| **Subcollections para 1:N** | ✅ | `franchises/{id}/stores/{id}` evita documentos grandes |
| **Dados globais separados** | ✅ | `users`, `invitations`, `audit_logs` na raiz |
| **Limite de 1MB por doc** | ✅ | Produtos, vendas em docs separados |
| **Denormalização controlada** | ✅ | `displayName` em membership evita lookups |
| **Imutabilidade de dados críticos** | ✅ | Sales são append-only |
| **Índices implícitos** | ✅ | IDs como chave primária |
| **Timestamps consistentes** | ✅ | `createdAt`, `updatedAt` em todos os tipos |
| **Soft delete** | ✅ | `isActive` em vez de delete |

#### ⚠️ **ATENÇÃO - Pontos a Considerar**

| Ponto | Análise | Recomendação |
|-------|---------|--------------|
| **Collection Group Queries** | Buscar vendas de todas as lojas requer query group | ✅ Correto, necessário para relatórios consolidados |
| **Deep nesting (3 níveis)** | `franchises/{fid}/stores/{sid}/products` | ✅ Aceitável - Firestore suporta até 100 níveis |
| **Custo de reads** | Cada membro lookup = 1 read | ⚠️ Considerar cache no client |
| **Busca por email em invitations** | Requer índice em `email` | ✅ Já funciona, criar índice composto se lento |

#### 🔧 **MELHORIAS RECOMENDADAS (Futuro)**

| Melhoria | Prioridade | Descrição |
|----------|------------|-----------|
| **Contador de docs** | Média | Adicionar `storeCount` em franchise para evitar count queries |
| **Cache de membership** | Alta | Usar Custom Claims do Firebase Auth para role/storeAccess |
| **Sharding de audit_logs** | Baixa | Se logs > 1M docs, particionar por `yyyy-mm` |
| **Índices compostos** | Média | Criar para queries frequentes (ex: `storeId + timestamp`) |

### 1.3 Validação das Security Rules

As regras em `firestore.rules` estão **CORRETAS** e seguem boas práticas:

✅ Funções helper reutilizáveis (`isAuthenticated`, `getMembership`, etc.)  
✅ Verificação de role e storeAccess  
✅ Proteção contra self-modification de role  
✅ Imutabilidade de sales e audit_logs  
✅ Modo legado permissivo (temporário para migração)  

---

## 2. O que Falta Implementar na FASE 1

### 2.1 Status Atual

| Componente | Status | Arquivo |
|------------|--------|---------|
| Tipos (franchise.ts) | ✅ Completo | `src/types/franchise.ts` |
| pathResolver.ts | ✅ Completo | `src/lib/pathResolver.ts` |
| authService.ts | ✅ Completo | `src/services/authService.ts` |
| userService.ts | ✅ Completo | `src/services/userService.ts` |
| franchiseService.ts | ✅ Completo | `src/services/franchiseService.ts` |
| dispenserService.ts | ✅ Completo | `src/services/dispenserService.ts` |
| AuthContext.tsx | ✅ Completo | `src/context/AuthContext.tsx` |
| FranchiseContext.tsx | ✅ Completo | `src/context/FranchiseContext.tsx` |
| PermissionContext.tsx | ✅ Completo | `src/context/PermissionContext.tsx` |
| Can.tsx | ✅ Completo | `src/components/ui/Can.tsx` |
| useDispensers.ts | ✅ Completo | `src/hooks/useDispensers.ts` |
| AdminDispensers.tsx | ✅ Completo | `src/components/AdminDispensers.tsx` |
| firestore.rules | ✅ Completo | `firestore.rules` |

### 2.2 Componentes Faltantes

| Componente | Prioridade | Descrição |
|------------|------------|-----------|
| **Tela de Login** | 🔴 Alta | Login com email/senha (Firebase Auth) |
| **Seletor de Loja** | 🔴 Alta | Para usuários com múltiplas lojas |
| **Tela de Convite** | 🟡 Média | Aceitar convite via link/token |
| **Integração PIN+Firebase** | 🔴 Alta | Conectar PIN existente com Firebase Auth |
| **Deploy Rules** | 🔴 Alta | Subir firestore.rules para Firebase |
| **Testes E2E** | 🟡 Média | Testar fluxos de auth e permissões |

---

## 3. Plano de Implementação - Restante da FASE 1

### Etapa 1.6: Tela de Login (2-3 dias)

#### Arquivos a Criar:
```
src/components/auth/
├── LoginForm.tsx           # Formulário email/senha
├── LoginWithPin.tsx        # Fallback PIN (modo offline)
├── ForgotPassword.tsx      # Recuperação de senha
└── AuthLayout.tsx          # Layout para telas de auth
```

#### Requisitos:
- [x] Input de email com validação
- [x] Input de senha com show/hide
- [x] Botão "Esqueci minha senha"
- [x] Toggle para "Login com PIN" (offline)
- [x] Mensagens de erro amigáveis
- [x] Loading state durante auth
- [x] Redirect para /admin após login
- [x] Persistência de sessão (remember me)

### Etapa 1.7: Seletor de Loja (1-2 dias)

#### Arquivos a Criar:
```
src/components/
├── StoreSelector.tsx       # Dropdown/modal de seleção
└── StoreSwitcher.tsx       # Botão no header para trocar
```

#### Requisitos:
- [x] Lista lojas do usuário (baseado em storeAccess)
- [x] Indicador visual da loja atual
- [x] Salvar seleção no localStorage
- [x] Integrar com StoreContext

### Etapa 1.8: Sistema de Convites (2-3 dias)

#### Arquivos a Criar:
```
src/pages/
└── AcceptInvite.tsx        # Página /invite?token=xxx

src/components/
└── InviteAcceptForm.tsx    # Formulário de aceite
```

#### Requisitos:
- [x] Rota `/invite?token=xxx`
- [x] Validar token e expiração
- [x] Se usuário não existe: criar conta
- [x] Se usuário existe: adicionar membership
- [x] Redirect para seletor de loja após aceite

### Etapa 1.9: Integração Final (1-2 dias)

#### Tarefas:
1. **Deploy firestore.rules**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Atualizar AdminSidebar.tsx**
   - Mostrar nome do usuário logado
   - Mostrar loja atual
   - Botão de logout

3. **Atualizar AdminSecretAccess.tsx**
   - Manter gesto secreto para PIN offline
   - Se online e logado, ir direto para /admin

4. **Atualizar ProtectedRoute.tsx**
   - Descomentar verificação de permissões
   - Testar redirecionamentos

### Etapa 1.10: Testes e QA (2-3 dias)

#### Cenários a Testar:

| Cenário | Teste |
|---------|-------|
| Login online | Email/senha → acesso ao admin |
| Login offline | PIN → acesso limitado |
| Troca de loja | Usuário com 2+ lojas troca entre elas |
| Permissões | Operator não vê produtos:edit |
| Convite | Novo usuário aceita convite |
| Sessão expirada | Timeout → redirect para login |
| Firebase down | Fallback para PIN funciona |

---

## 4. Cronograma Estimado

```
Semana Atual (Dias 1-5):
├── Dia 1-2: Etapa 1.6 - Tela de Login
├── Dia 3: Etapa 1.7 - Seletor de Loja
├── Dia 4-5: Etapa 1.8 - Sistema de Convites

Semana Seguinte (Dias 6-10):
├── Dia 6-7: Etapa 1.9 - Integração Final
├── Dia 8-10: Etapa 1.10 - Testes e QA
└── Deploy para staging
```

**Total estimado: 8-12 dias úteis**

---

## 5. Decisões Arquiteturais Pendentes

### 5.1 Custom Claims vs Firestore Lookup

**Opção A: Custom Claims (Recomendado)**
```typescript
// Token JWT inclui role e storeAccess
// Prós: Sem lookup no Firestore, mais rápido
// Contras: Requer Cloud Function para atualizar
```

**Opção B: Firestore Lookup (Atual)**
```typescript
// Busca membership no Firestore a cada request
// Prós: Dados sempre atualizados
// Contras: 1 read extra por request
```

**Decisão:** Manter Opção B por ora, migrar para A na FASE 2 com Cloud Functions.

### 5.2 Audit Log - Client vs Server

**Opção A: Client-side (Atual)**
```typescript
// App escreve diretamente no audit_logs
// Prós: Simples, funciona offline
// Contras: Cliente pode manipular
```

**Opção B: Server-side (Recomendado para produção)**
```typescript
// Cloud Function escreve audit_logs
// Prós: Seguro, consistente
// Contras: Requer Cloud Functions
```

**Decisão:** Manter Opção A na FASE 1, migrar para B na FASE 2.

---

## 6. Checklist Final FASE 1

- [x] Tipos TypeScript definidos
- [x] Services implementados
- [x] Contexts implementados
- [x] Componente Can.tsx
- [x] Security Rules
- [x] Build sem erros
- [ ] Tela de Login
- [ ] Seletor de Loja
- [ ] Sistema de Convites
- [ ] Deploy Rules
- [ ] Testes E2E
- [ ] Documentação atualizada

---

## 7. Próximos Passos Imediatos

1. **Criar componentes de auth** (`LoginForm.tsx`, `LoginWithPin.tsx`)
2. **Criar rota de login** (`/login`)
3. **Integrar com AdminSecretAccess** (detectar se já logado)
4. **Testar fluxo completo** (login → seletor → admin)
5. **Deploy firestore.rules** para Firebase

