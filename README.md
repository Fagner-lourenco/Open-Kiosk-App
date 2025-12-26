# Open Kiosk 🏪

![Open Kiosk Demo](https://github.com/MukeshSankhla/Open-Kiosk/blob/main/images/GPH.gif)

An open-source, complete hardware + software kiosk solution designed for retail stores. Built with modern web technologies and integrated hardware components for a seamless point-of-sale experience.

## 🌟 Features

### Core Functionality
- **Complete POS System**: Add items, create bills, and manage inventory
- **Thermal Printing**: Integrated thermal printer support with fallback to system printer
- **Real-time Database**: All orders recorded with Firebase integration
- **Multi-language Support**: Tags can be entered in native language pronunciation
- **Multi-currency Support**: Flexible currency configuration
- **Voice Search**: Advanced search functionality with voice input
- **Offline Operation**: Runs locally - no hosting required

### 💳 Pagamentos Integrados (Mercado Pago)
- **PIX / QR Code**: Pagamento instantâneo via app do banco
- **Cartão de Crédito**: Terminal Point com parcelamento
- **Cartão de Débito**: Terminal Point à vista
- **Polling automático**: Confirmação em tempo real
- **Webhooks**: Notificações de pagamento do Mercado Pago

### Business Management
- **Sales Tracking**: Complete order history with date filtering
- **Report Generation**: Daily and custom timeframe reports (exportable as CSV)
- **Bill Reprinting**: Reprint any previous bill from order history
- **Tax Management**: Configurable tax rates and Tax ID setup
- **Admin Dashboard**: Real-time revenue and order statistics

### Hardware Integration
- **LattePanda MU**: Main computing unit
- **Seeed Xiao ESP32 S3**: Microcontroller for printer communication
- **Thermal Printer**: Direct printing via UART communication
- **Touch Screen**: Interactive user interface
- **Mercado Pago Point**: Terminal de cartão integrado

## 💻 Technology Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Database**: Google Firebase (Firestore)
- **Payments**: Mercado Pago (QR Code + Point Terminal)
- **Backend**: Node.js + Express (webhooks)
- **Hardware Communication**: UART (ESP32 ↔ Thermal Printer)

---

## 🚀 Quick Start (Desenvolvimento)

### 1. Clone e Instale

```bash
git clone https://github.com/MukeshSankhla/Open-Kiosk-App.git
cd Open-Kiosk-App
npm install
```

### 2. Configure as Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Firebase
VITE_FIREBASE_API_KEY=sua_api_key
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_projeto
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Mercado Pago
VITE_MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxx
VITE_MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxxx
VITE_MP_TERMINAL_ID=TIPO__SERIAL  # Opcional - auto-detecta se vazio
```

### 3. Inicie o Frontend

```bash
npm run dev
```

O app estará disponível em `http://localhost:8080`

---

## 🔧 Subindo os Serviços (Desenvolvimento Completo)

Para testar pagamentos com Mercado Pago, você precisa de **3 terminais** rodando simultaneamente:

### Terminal 1: Frontend (Vite)

```bash
# Na raiz do projeto
npm run dev
```
> App disponível em: `http://localhost:8080`

### Terminal 2: Servidor de Webhooks

```bash
# Entre na pasta server
cd server
npm install

# Inicie o servidor
node index.js
```
> Servidor de webhooks em: `http://localhost:3001`

### Terminal 3: Ngrok (Túnel para Webhooks)

O Mercado Pago precisa acessar seu servidor local para enviar notificações. O ngrok cria um túnel público.

```bash
# Instale o ngrok: https://ngrok.com/download
# Depois execute:
ngrok http 3001
```

**Copie a URL gerada** (ex: `https://abc123.ngrok-free.app`) e configure no painel do Mercado Pago.

### Diagrama dos Serviços

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend       │     │   Webhook Server │     │     Ngrok        │
│   (Vite)         │     │   (Express)      │     │   (Túnel)        │
│   :8080          │────▶│   :3001          │◀────│   :443           │
│                  │     │                  │     │                  │
│  React App       │     │  /api/webhooks/  │     │  URL pública     │
│  Mercado Pago    │     │  mercadopago     │     │  para MP         │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                │
                                ▼
                         ┌──────────────────┐
                         │    Firebase      │
                         │   (Firestore)    │
                         │                  │
                         │  webhook_events  │
                         │  sales           │
                         └──────────────────┘
```

---

## ⚙️ Configuração do Mercado Pago

### 1. Criar Aplicação no Mercado Pago

1. Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers)
2. Crie uma nova aplicação
3. Obtenha o **Access Token** e **Public Key**
4. Configure no `.env`

### 2. Criar Loja e Caixa (POS)

```bash
# Criar loja
curl -X POST https://api.mercadopago.com/users/{user_id}/stores \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Minha Loja",
    "external_id": "LOJ001",
    "location": {
      "city_name": "São Paulo",
      "state_name": "SP"
    }
  }'

# Criar caixa (POS)
curl -X POST https://api.mercadopago.com/pos \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Caixa 1",
    "store_id": "123456",
    "external_store_id": "LOJ001",
    "external_id": "LOJ001POS001",
    "category": 621102
  }'
```

> **Importante**: O `external_id` do POS deve corresponder ao `EXTERNAL_POS_ID` em `src/config/mercadopago.ts`

### 3. Configurar Webhook

1. No painel de desenvolvedor, vá em **Webhooks**
2. Clique em **Adicionar webhook**
3. URL: `https://sua-url-ngrok.ngrok-free.app/api/webhooks/mercadopago`
4. Eventos: Marque **Payments** e **Orders**
5. Salve

### 4. Terminal Point (Cartão de Crédito/Débito)

1. Conecte seu terminal Point ao computador/rede
2. Configure para modo **PDV** (não STANDALONE) no app Mercado Pago
3. O sistema detecta automaticamente o terminal disponível
4. Ou configure manualmente no `.env`:
   ```env
   VITE_MP_TERMINAL_ID=GERTEC_MP35P__MP35P12345678
   ```

Para listar terminais disponíveis:
```bash
curl https://api.mercadopago.com/terminals/v1/list \
  -H "Authorization: Bearer {access_token}"
```

---

## 🏭 Ajustes para Produção

### 1. Variáveis de Ambiente de Produção

Crie um arquivo `.env.production`:

```env
# PRODUÇÃO - Use credenciais de produção!
VITE_MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxx-PRODUCAO
VITE_MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxxx-PRODUCAO

# Firebase produção
VITE_FIREBASE_API_KEY=sua_api_key_producao
VITE_FIREBASE_PROJECT_ID=seu_projeto_producao

# Terminal Point (opcional)
VITE_MP_TERMINAL_ID=TIPO__SERIAL
```

No servidor de webhooks (`server/.env`):
```env
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxx-PRODUCAO
MERCADOPAGO_WEBHOOK_SECRET=seu_secret
VALIDATE_SIGNATURE=true
FIREBASE_PROJECT_ID=seu_projeto_producao
FIREBASE_API_KEY=sua_api_key
```

### 2. Build de Produção

```bash
npm run build
```

Os arquivos otimizados estarão em `dist/`

### 3. Deploy do Servidor de Webhooks

Opções recomendadas:

#### Railway (Mais fácil)
```bash
cd server
railway login
railway init
railway up
```

#### PM2 (VPS/Servidor próprio)
```bash
cd server
npm install -g pm2
pm2 start index.js --name "kiosk-webhooks"
pm2 startup
pm2 save
```

#### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
```

### 4. Checklist de Produção

- [ ] Usar credenciais de **PRODUÇÃO** do Mercado Pago (não sandbox)
- [ ] Configurar `VALIDATE_SIGNATURE=true` no servidor
- [ ] Usar HTTPS para o webhook (obrigatório em produção)
- [ ] Configurar domínio próprio ou IP fixo para webhook
- [ ] Atualizar URL do webhook no painel do Mercado Pago
- [ ] Testar fluxo completo de pagamento com valor real
- [ ] Configurar backup automático do Firebase
- [ ] Remover `console.log` de dados sensíveis
- [ ] Configurar monitoramento (ex: UptimeRobot)

### 5. Arquitetura de Produção

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRODUÇÃO                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Frontend   │    │   Webhook    │    │   Firebase   │       │
│  │   (CDN)      │    │   Server     │    │   (Google)   │       │
│  │              │    │              │    │              │       │
│  │  Vercel/     │    │  Railway/    │    │  Firestore   │       │
│  │  Netlify     │    │  Render      │    │  Auth        │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   ▲                    ▲               │
│         │                   │                    │               │
│         ▼                   │                    │               │
│  ┌──────────────┐           │                    │               │
│  │  Mercado     │───────────┘                    │               │
│  │  Pago API    │                                │               │
│  │              │────────────────────────────────┘               │
│  │  QR + Point  │                                                │
│  └──────────────┘                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Estrutura do Projeto

```
Open-Kiosk-App/
├── src/
│   ├── components/
│   │   ├── Checkout.tsx              # Checkout do carrinho
│   │   ├── DrinkQuickCheckoutModal.tsx  # Checkout rápido bebidas (if=drink)
│   │   ├── ProductGrid.tsx           # Grade de produtos
│   │   ├── Cart.tsx                  # Carrinho de compras
│   │   └── ...
│   ├── services/
│   │   ├── paymentService.ts         # Serviço de pagamentos (QR + Point)
│   │   ├── mercadopagoAPI.ts         # API do Mercado Pago
│   │   ├── salesService.ts           # Registro de vendas
│   │   └── firebase.ts               # Configuração Firebase
│   ├── config/
│   │   └── mercadopago.ts            # Configurações e constantes MP
│   ├── types/
│   │   └── mercadopago.ts            # Tipos TypeScript para MP
│   └── hooks/
│       └── useCheckoutFlow.ts        # Hook de fluxo de checkout
├── server/
│   └── index.js                      # Servidor Express de webhooks
├── .env.example                      # Exemplo de variáveis de ambiente
├── package.json
└── README.md
```

---

## 🔍 Fluxos de Pagamento

### PIX / QR Code

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Seleciona  │───▶│  Clica em   │───▶│  QR Code    │───▶│  Cliente    │
│  PIX/QR     │    │  "Gerar QR" │    │  Exibido    │    │  Escaneia   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                                │
                                                                ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Venda      │◀───│  Pagamento  │◀───│  Polling    │◀───│  Paga no    │
│  Registrada │    │  Confirmado │    │  (5s)       │    │  App Banco  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Cartão (Crédito/Débito)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Seleciona  │───▶│  Clica em   │───▶│  Order      │───▶│  Terminal   │
│  Crédito ou │    │  "Pagar"    │    │  Enviada    │    │  Point      │
│  Débito     │    │             │    │             │    │  Ativado    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                                │
                                                                ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Venda      │◀───│  Pagamento  │◀───│  Polling    │◀───│  Insere/    │
│  Registrada │    │  Confirmado │    │  (5s)       │    │  Aproxima   │
└─────────────┘    └─────────────┘    └─────────────┘    │  Cartão     │
                                                         └─────────────┘
```

---

## 🐛 Troubleshooting

### QR Code não é gerado

1. Verifique se `VITE_MERCADOPAGO_ACCESS_TOKEN` está correto no `.env`
2. Confirme que `EXTERNAL_POS_ID` existe no Mercado Pago
3. Verifique o console do navegador para erros de API
4. Teste a API diretamente:
   ```bash
   curl https://api.mercadopago.com/users/me \
     -H "Authorization: Bearer {access_token}"
   ```

### Webhook não recebe notificações

1. Verifique se ngrok está rodando: `ngrok http 3001`
2. Confirme a URL no painel do Mercado Pago
3. Verifique logs do servidor: `node index.js`
4. Teste manualmente:
   ```bash
   curl -X POST https://sua-url.ngrok-free.app/api/webhooks/mercadopago \
     -H "Content-Type: application/json" \
     -d '{"type":"payment","data":{"id":"123"}}'
   ```

### Terminal Point não detectado

1. Verifique se o terminal está em modo **PDV** (não STANDALONE)
2. Rode a API de listar terminais:
   ```bash
   curl https://api.mercadopago.com/terminals/v1/list \
     -H "Authorization: Bearer {access_token}"
   ```
3. Configure manualmente no `.env`: `VITE_MP_TERMINAL_ID=TIPO__SERIAL`

### Pagamento não é confirmado

1. Verifique o polling no console do navegador (F12)
2. Confirme que o webhook está salvando no Firestore
3. Verifique a collection `webhook_events` no Firebase Console
4. Verifique se o polling está ativo: deve aparecer "Tentativa X/60"

### Erro de CORS

1. Verifique se o servidor de webhooks está rodando
2. Confirme a porta correta (3001 por padrão)
3. O frontend usa proxy do Vite para `/api/*`

---

## 🎯 Target Users

- **Small Retail Stores**: Independent shops and boutiques
- **Cafes & Restaurants**: Quick service establishments
- **Market Vendors**: Portable POS solution
- **Pop-up Shops**: Temporary retail locations
- **Any Business**: Requiring affordable POS system

## 🤝 Contributing

We welcome contributions! This is an open-source project designed to help small businesses worldwide.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/nova-funcionalidade`
3. Commit changes: `git commit -m 'Add nova funcionalidade'`
4. Push to branch: `git push origin feature/nova-funcionalidade`
5. Open a Pull Request

## 📄 License

This project is open source and available under the MIT License.

---

**Built with ❤️ for small businesses everywhere**

*Transform your store with Open Kiosk - the complete, affordable, and open-source POS solution.*
