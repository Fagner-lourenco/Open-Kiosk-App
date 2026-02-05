# Payment Gateway Architecture

## Canonical Schema (Firestore: stores/{storeId}.paymentGatewayConfig)

```
paymentGatewayConfig = {
  provider: "none" | "mercado_pago" | "mercadopago" | "pagbank",
  environment: "sandbox" | "production",
  enabledMethods: { cash: boolean, pix: boolean, credit: boolean, debit: boolean },
  pixKey?: string,
  providers?: {
    pagbank?: { clientId?: string, merchantId?: string, publicKey?: string },
    mercadopago?: { userId?: string, storeId?: string, externalPosId?: string, terminalId?: string }
  }
}
```

Notas:
- Segredos (tokens/keys) nao sao persistidos no Firestore. Usar Functions config/Secret Manager.
- Campos legados (`acceptCash`, `acceptPix`, `acceptCard`, `pixKey`, `paymentGateway`) sao lidos apenas para compatibilidade.

## Interfaces (Functions)

```
interface PaymentProvider {
  createPayment(input): Promise<{ status, providerOrderId?, providerPaymentId?, pix? }>;
  getPaymentStatus?(payment): Promise<{ status, providerOrderId?, providerPaymentId?, pix? }>;
}
```

## Fluxo (ASCII)

```
Admin (Web) -> Firestore (stores/{storeId}.paymentGatewayConfig)
Kiosk        -> createPayment (Cloud Function)
           -> Firestore (stores/{storeId}/payments/{paymentId})
Functions   -> PagBank API (create order / get status)
PagBank     -> Webhook (pagbankWebhook)
Webhook     -> Firestore (payments/{paymentId} status)
Kiosk       -> watchPaymentStatus (Firestore listener)
```

## Colecoes

- Pagamentos: `franchises/{franchiseId}/stores/{storeId}/payments/{paymentId}`

## Migracao e Rollback

Cloud Functions:
- `consolidatePaymentGatewayConfig` (callable)
  - `dryRun=true` (padrao): apenas loga/retorna impacto
  - `commit=true`: grava `paymentGatewayConfig` consolidado
  - `removeLegacy=true`: remove campos legados (opcional, apos validar)
- `rollbackPaymentGatewayConfig` (callable)
  - Reaplica snapshot `before` gravado em `migrations/paymentGatewayConfig/{runId}/stores/{storeId}`

## Segurança

- Tokens/segredos do PagBank ficam em `functions.config().pagbank.*` (ou Secret Manager).
- Webhook valida assinatura via `x-authenticity-token` (SHA-256).
