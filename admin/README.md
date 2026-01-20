# Open Kiosk Admin

Portal web de administração para franquias e lojas do Open Kiosk.

## 🏗️ Estrutura

Este diretório contém o código do **App Admin Web** que é complementar ao App Kiosk.

### Funcionalidades

- ✅ Dashboard consolidado de franquias
- ✅ Gestão de lojas
- ✅ Gestão de usuários e convites
- ✅ Relatórios consolidados
- ✅ Auditoria
- ✅ Billing (opcional)

### Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Firebase (Auth + Firestore)
- TanStack Query

## 🚀 Desenvolvimento

```bash
cd admin
npm install
npm run dev
```

## 📁 Estrutura de Arquivos

```
admin/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   ├── franchise/
│   │   ├── stores/
│   │   ├── users/
│   │   ├── reports/
│   │   └── ui/
│   ├── pages/
│   ├── context/
│   ├── hooks/
│   ├── services/
│   ├── types/ (importado do parent)
│   └── lib/
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🔗 Código Compartilhado

Os seguintes arquivos são importados do projeto principal:

- `../src/types/franchise.ts`
- `../src/services/franchiseService.ts`
- `../src/lib/pathResolver.ts`
