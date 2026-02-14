/**
 * pagbankEncrypt.ts — PagBank card encryption via PagBank.js SDK
 *
 * Phase 0 Security Hardening:
 * Encrypts raw card data client-side using PagBank's publicKey.
 * The encrypted blob is sent to Cloud Functions — the backend never sees raw PAN/CVV.
 *
 * PagBank.js reference:
 * https://dev.pagbank.uol.com.br/reference/tokenizacao-pagbank
 *
 * The script tag for PagBank.js must be loaded in index.html:
 *   <script src="https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js"></script>
 *
 * Usage:
 *   import { encryptCard } from '@/utils/pagbankEncrypt';
 *   const encrypted = await encryptCard({ publicKey, ... });
 */

/** Raw card data collected from the payment form (never sent to backend) */
export interface RawCardData {
  number: string;
  expMonth: string;
  expYear: string;
  securityCode: string;
  holderName: string;
}

/** Type for the global PagSeguro object loaded by PagBank.js */
interface PagSeguroSDK {
  encryptCard: (params: {
    publicKey: string;
    holder: string;
    number: string;
    expMonth: string;
    expYear: string;
    securityCode: string;
  }) => {
    encryptedCard: string;
    hasErrors: boolean;
    errors: Array<{ code: string; message: string }>;
  };
}

/** Get the globally loaded PagSeguro object */
function getPagSeguroSDK(): PagSeguroSDK {
  const sdk = (window as unknown as { PagSeguro?: PagSeguroSDK }).PagSeguro;
  if (!sdk || typeof sdk.encryptCard !== 'function') {
    throw new Error(
      'PagSeguro SDK não carregado. Verifique se o script PagBank.js está incluído no index.html.'
    );
  }
  return sdk;
}

/**
 * Encrypt card data using PagBank.js SDK.
 *
 * @param publicKey — PagBank publicKey from store settings
 * @param cardData — Raw card fields (from form inputs)
 * @returns Opaque encrypted string to send as `card.encrypted` to Cloud Functions
 * @throws Error if SDK not loaded or encryption fails
 */
export function encryptCard(publicKey: string, cardData: RawCardData): string {
  if (!publicKey) {
    throw new Error('PagBank publicKey ausente. Configure no painel Admin.');
  }

  const sdk = getPagSeguroSDK();

  const result = sdk.encryptCard({
    publicKey,
    holder: cardData.holderName,
    number: cardData.number.replace(/\D/g, ''),
    expMonth: cardData.expMonth.replace(/\D/g, ''),
    expYear: cardData.expYear.replace(/\D/g, ''),
    securityCode: cardData.securityCode.replace(/\D/g, ''),
  });

  if (result.hasErrors || !result.encryptedCard) {
    const messages = result.errors?.map((e) => e.message).join('; ') || 'Erro de criptografia';
    throw new Error(`Falha ao criptografar cartão: ${messages}`);
  }

  return result.encryptedCard;
}
