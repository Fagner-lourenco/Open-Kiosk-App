# 🚀 Plano de Reset Completo — Deploy de Produção

## Contexto

O projeto Firebase `open-kiosk-22b2b` foi usado durante desenvolvimento e está poluído com dados de teste. Este plano descreve como **deletar tudo** e reimplantar do zero para produção.

---

## Inventário dos Serviços Firebase em Uso

| Serviço | O que contém (dev) |
|---|---|
| **Firestore** | ~30+ coleções/subcoleções com dados de teste |
| **Firebase Auth** | Usuários de teste criados durante desenvolvimento |
| **Firebase Storage** | Vídeos de atração em `franchises/{fId}/stores/{sId}/media/` |
| **Cloud Functions** | 20+ funções (triggers, callables, scheduled) |
| **Hosting** | App Kiosk (SPA) |
| **Firestore Rules** | Regras RBAC multi-franchise |
| **Firestore Indexes** | ~15+ índices compostos |

---

## ⚠️ DECISÃO IMPORTANTE: Mesmo Projeto ou Novo Projeto?

### Opção A: Limpar o projeto existente (Recomendado ✅)
- Mais rápido, mantém a mesma configuração
- Não precisa alterar `.env`, `capacitor.config.ts`, etc.
- Os domínios de hosting/auth já estão configurados

### Opção B: Criar projeto Firebase novo
- Isolamento total dev/prod
- Requer reconfigurar **todas** as variáveis de ambiente
- Melhor prática a longo prazo (pode ser feito depois)

**Este plano segue a Opção A** (limpar o projeto existente).

---

## Etapas de Execução

### FASE 1 — Limpeza Total (Deletar Dados)

#### 1.1 Deletar TODOS os dados do Firestore

```powershell
# No terminal do projeto
cd d:\Open-Kiosk-App

# Deletar TODAS as coleções recursivamente
# Isso deleta documentos + subcoleções automaticamente
firebase firestore:delete --all-collections --project open-kiosk-22b2b --force
```

> **⚠️ CUIDADO**: Este comando é IRREVERSÍVEL. Todos os documentos em todas as coleções serão deletados permanentemente.

**Coleções que serão removidas:**
- `users` — dados dos usuários
- `superadmins` — registro de super admins
- `franchises` (+ todas subcoleções: `members`, `stores`, `products`, `orders`, `payments`, `settings`, `dispensers`, `taps`, `kegs`, `rankingAgg`, `tvConfig`, `eventStats`, `challenges`, `prizes`, `customers`, `deals`, `calendarItems`, `finAccounts`, `finLedger`, etc.)
- `invitations` — convites pendentes
- `audit_logs` — logs legados
- `analytics` — agregados diários/horários
- `settings` — configurações globais
- `migrations` — metadados de migração

#### 1.2 Deletar TODOS os usuários do Firebase Auth

```powershell
# Listar usuários existentes (para verificação)
firebase auth:export users-backup.json --project open-kiosk-22b2b

# Deletar TODOS os usuários de Auth
# Opção 1: Via Firebase Console (mais seguro)
# → Authentication → Selecionar todos → Excluir

# Opção 2: Via script Node.js (mais rápido)
cd functions
node -e "
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'open-kiosk-22b2b' });
async function deleteAll() {
  const list = await admin.auth().listUsers(1000);
  const uids = list.users.map(u => u.uid);
  console.log('Deletando ' + uids.length + ' usuarios...');
  const result = await admin.auth().deleteUsers(uids);
  console.log('Deletados: ' + result.successCount + ', Falhas: ' + result.failureCount);
}
deleteAll().catch(console.error);
"
cd ..
```

> **⚠️ IMPORTANTE**: Deletar usuários Auth é ESSENCIAL. Se você só limpar o Firestore mas manter os auth users, o trigger `onUserCreated` **não** re-executa no próximo login (o usuário já existe). Isso deixaria o Firestore inconsistente.

#### 1.3 Deletar arquivos do Firebase Storage

```powershell
# Via Firebase Console (mais fácil):
# → Storage → Selecionar pasta "franchises/" → Excluir

# Ou via gsutil (se tiver Google Cloud SDK instalado):
gsutil -m rm -r gs://open-kiosk-22b2b.firebasestorage.app/**
```

> **Nota**: São apenas vídeos de atração (MP4/WebM). Podem ser re-uploadados depois via Admin → Configurações da Loja.

---

### FASE 2 — Deploy Completo (Reimplantar Tudo)

#### 2.1 Deploy das Firestore Rules + Indexes

```powershell
cd d:\Open-Kiosk-App

# Deploy das regras de segurança e índices compostos
firebase deploy --only firestore --project open-kiosk-22b2b
```

Isso implanta:
- `firestore.rules` — Regras RBAC multi-franchise (1236 linhas)
- `firestore.indexes.json` — ~15+ índices compostos

> **Nota**: Índices podem levar **5-15 minutos** para serem construídos. Aguarde no Firebase Console → Firestore → Indexes até todos mostrarem status "Enabled".

#### 2.2 Deploy das Cloud Functions

```powershell
# Build + Deploy das funções
firebase deploy --only functions --project open-kiosk-22b2b
```

Isso faz:
1. `npm run build` no diretório `functions/` (predeploy)
2. Upload e deploy de todas as Cloud Functions

**Funções incluídas:**
- Auth triggers (`onUserCreated`)
- Firestore triggers (ranking aggregation, etc.)
- Callables (payments, ranking, superadmin, etc.)
- Scheduled (recalculate30min, syncPayments)
- HTTP (webhooks de pagamento)

#### 2.3 Build + Deploy do Kiosk App (Hosting)

```powershell
# Build do app Kiosk
npm run build

# Deploy para Firebase Hosting
firebase deploy --only hosting --project open-kiosk-22b2b
```

#### 2.4 Build do Admin App (Vercel)

```powershell
# O Admin é deployado no Vercel separadamente
cd admin
npm run build
# Deploy via Vercel CLI ou git push (conforme configurado)
cd ..
```

> **Alternativa**: Se o Admin não está no Vercel, verifique o `admin/vercel.json`.

---

### FASE 3 — Configuração Inicial (Dados Obrigatórios)

#### 3.1 Criar conta do Superadmin

```powershell
# 1. Primeiro, registre a conta na interface web do Kiosk ou Admin
#    Email: fagner.alexandro.lourenco@gmail.com
#    (o trigger onUserCreated criará automaticamente user doc + franquia trial)

# 2. Depois, promova a superadmin via script:
cd functions
node scripts/promote-superadmin.js
cd ..
```

**O que o script faz:**
- Define custom claims `{ role: 'superadmin' }` no Auth
- Cria documento em `superadmins/{uid}`
- Atualiza documento em `users/{uid}` com `role: 'superadmin'`

> **OBRIGATÓRIO**: Sem o superadmin, ninguém consegue gerenciar franquias no Admin.

#### 3.2 Configuração via Admin (Manual)

Após logar como superadmin no Admin (`admin/`):

1. **Criar Franquia** (ou usar a auto-criada no registro)
2. **Criar Loja** dentro da franquia
3. **Cadastrar Produtos** (cervejas/chopps com preços)
4. **Configurar Torneiras** (dispensers ESP32)
5. **Configurar Settings** da loja (moeda, timezone, etc.)
6. **Upload de Vídeo** de atração (opcional)
7. **Configurar TV** (ranking, layout, etc.)
8. **Configurar Pagamentos** (gateway, PIX, etc.)

---

### FASE 4 — Deploy Android (Capacitor)

```powershell
# Sincronizar o projeto Capacitor
npx cap sync android

# Abrir no Android Studio para gerar APK/AAB
npx cap open android
```

> No Android Studio: Build → Generate Signed Bundle / APK

---

## Resumo: Script de Deploy Completo (One-Shot)

```powershell
# ╔══════════════════════════════════════════════════════════════╗
# ║  SCRIPT DE RESET + DEPLOY COMPLETO — OPEN KIOSK            ║
# ║  ⚠️ EXECUÇÃO IRREVERSÍVEL — DESTRÓI TODOS OS DADOS ⚠️      ║
# ╚══════════════════════════════════════════════════════════════╝

$PROJECT = "open-kiosk-22b2b"
cd d:\Open-Kiosk-App

Write-Host "═══ FASE 1: LIMPEZA ═══" -ForegroundColor Red

# 1.1 Deletar Firestore
Write-Host "[1/3] Deletando Firestore..." -ForegroundColor Yellow
firebase firestore:delete --all-collections --project $PROJECT --force

# 1.2 Deletar Auth users
Write-Host "[2/3] Deletando Auth users..." -ForegroundColor Yellow
Push-Location functions
node -e "
const admin = require('firebase-admin');
admin.initializeApp({ projectId: '$PROJECT' });
(async () => {
  let total = 0;
  let page;
  do {
    page = await admin.auth().listUsers(1000, page?.pageToken);
    if (page.users.length) {
      const r = await admin.auth().deleteUsers(page.users.map(u => u.uid));
      total += r.successCount;
    }
  } while (page.pageToken);
  console.log('Auth users deletados: ' + total);
})().catch(console.error);
"
Pop-Location

# 1.3 Storage (manual via Console ou gsutil)
Write-Host "[3/3] Storage: Delete manualmente via Firebase Console" -ForegroundColor Yellow

Write-Host ""
Write-Host "═══ FASE 2: DEPLOY ═══" -ForegroundColor Green

# 2.1 Firestore rules + indexes
Write-Host "[1/4] Deploy Firestore rules + indexes..." -ForegroundColor Cyan
firebase deploy --only firestore --project $PROJECT

# 2.2 Cloud Functions
Write-Host "[2/4] Deploy Cloud Functions..." -ForegroundColor Cyan
firebase deploy --only functions --project $PROJECT

# 2.3 Kiosk Hosting
Write-Host "[3/4] Build + Deploy Kiosk..." -ForegroundColor Cyan
npm run build
firebase deploy --only hosting --project $PROJECT

# 2.4 Admin (Vercel - separado)
Write-Host "[4/4] Admin: faça deploy via Vercel separadamente" -ForegroundColor Cyan

Write-Host ""
Write-Host "═══ FASE 3: SETUP INICIAL ═══" -ForegroundColor Magenta
Write-Host "1. Registre a conta superadmin na interface web" -ForegroundColor White
Write-Host "   Email: fagner.alexandro.lourenco@gmail.com" -ForegroundColor White
Write-Host "2. Execute: cd functions && node scripts/promote-superadmin.js" -ForegroundColor White
Write-Host "3. Configure franquia, loja, produtos e torneiras no Admin" -ForegroundColor White

Write-Host ""
Write-Host "✅ DEPLOY COMPLETO!" -ForegroundColor Green
```

---

## Checklist Pós-Deploy

- [ ] Firestore vazio (verificar no Console)
- [ ] Auth users deletados (verificar no Console)
- [ ] Storage limpo (verificar no Console)
- [ ] Firestore Rules ativas (Console → Rules)
- [ ] Firestore Indexes todos "Enabled" (Console → Indexes)
- [ ] Cloud Functions sem erros (Console → Functions → Logs)
- [ ] Hosting acessível (URL do Firebase Hosting)
- [ ] Admin acessível (URL do Vercel)
- [ ] Conta superadmin criada e funcional
- [ ] Franquia + Loja configuradas
- [ ] Pelo menos 1 produto cadastrado
- [ ] ESP32 conectando ao Kiosk
- [ ] Pagamento de teste funcional
- [ ] TV Dashboard mostrando ranking

---

## ⚠️ Considerações de Segurança para Produção

### Regras de Storage (FALTANDO!)
Não existe arquivo `storage.rules` no projeto. Recomendado criar:

```
// storage.rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /franchises/{franchiseId}/stores/{storeId}/media/{fileName} {
      allow read: if true;  // Vídeos são públicos (exibidos no Kiosk)
      allow write: if request.auth != null;  // Apenas autenticados fazem upload
    }
    match /{allPaths=**} {
      allow read, write: if false;  // Bloqueia tudo que não for media
    }
  }
}
```

E adicionar ao `firebase.json`:
```json
"storage": {
  "rules": "storage.rules"
}
```

### Variáveis de Ambiente
- Verificar se `.env` / `.env.local` apontam para o projeto correto
- **NÃO** commitar `.env.local` no git

### Backup
- Considerar ativar [Firebase Firestore Backups](https://firebase.google.com/docs/firestore/backups) (plano Blaze)
- Exportar dados periodicamente: `firebase firestore:export gs://bucket/backup`
