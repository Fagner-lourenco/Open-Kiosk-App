import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const VALIDATE = (process.env.MP_WEBHOOK_VALIDATE || 'false').toLowerCase() === 'true';
const SECRET = process.env.MP_WEBHOOK_SECRET || '';
const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || '';

// Capturar corpo bruto para validação de assinatura
app.use(express.json({
  verify: (req, res, buf) => {
    // anexar rawBody
    req.rawBody = buf.toString();
  }
}));
app.use(cors());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

function parseSignatureHeader(signatureHeader) {
  // Suporta formatos: "ts=...,v1=..." ou apenas hash hex
  if (!signatureHeader) return null;
  const parts = signatureHeader.split(',');
  const obj = {};
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k && v) obj[k.trim()] = v.trim();
  }
  if (obj.v1) return { ts: obj.ts, hash: obj.v1 };
  return { ts: null, hash: signatureHeader };
}

function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret) return false;
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed || !parsed.hash) return false;
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(parsed.hash));
}

async function fetchPayment(paymentId) {
  if (!MP_TOKEN) throw new Error('MERCADOPAGO_ACCESS_TOKEN is missing');
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${MP_TOKEN}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP payment fetch failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Fetch Point Order details from Mercado Pago Orders v1 API
 */
async function fetchPointOrder(orderId) {
  if (!MP_TOKEN) throw new Error('MERCADOPAGO_ACCESS_TOKEN is missing');
  const url = `https://api.mercadopago.com/v1/orders/${orderId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${MP_TOKEN}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP order fetch failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function fetchMerchantOrder(merchantOrderId) {
  if (!MP_TOKEN) throw new Error('MERCADOPAGO_ACCESS_TOKEN is missing');
  const url = `https://api.mercadopago.com/merchant_orders/${merchantOrderId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${MP_TOKEN}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP order fetch failed (${res.status}): ${text}`);
  }

  return res.json();
}

function toFirestoreDocument(merchantOrder) {
  const id = merchantOrder.id?.toString() || 'unknown';
  const status = merchantOrder.order_status || merchantOrder.status || 'unknown';
  const payments = Array.isArray(merchantOrder.payments) ? merchantOrder.payments : [];
  const paidAmount = payments.reduce((acc, p) => acc + Number(p.total_paid_amount || 0), 0);

  return {
    fields: {
      status: { stringValue: status },
      amount: { doubleValue: Number(paidAmount) || 0 },
      updatedAt: { timestampValue: new Date().toISOString() },
      raw: {
        mapValue: {
          fields: {
            id: { stringValue: id },
            order_status: { stringValue: status },
            payments: {
              arrayValue: {
                values: payments.slice(0, 5).map((p) => {
                  const paymentFields = {
                    id: { stringValue: (p.id ?? '').toString() },
                    status: { stringValue: p.status || '' },
                    total_paid_amount: { doubleValue: Number(p.total_paid_amount || 0) },
                  };

                  if (p.date_approved) {
                    paymentFields.date_approved = {
                      timestampValue: new Date(p.date_approved).toISOString(),
                    };
                  }

                  return {
                    mapValue: {
                      fields: paymentFields,
                    },
                  };
                }),
              },
            },
          },
        },
      },
    },
  };
}

/**
 * Convert Point Order (from Orders v1 API) to Firestore document
 * Point orders have different structure than merchant_orders
 */
function toFirestorePointDocument(order) {
  const id = order.id || 'unknown';
  const status = order.status || 'unknown';
  const payments = order.transactions?.payments || [];
  const totalAmount = Number(order.total_amount) || 0;
  const paymentMethod = payments[0]?.payment_method || {};

  return {
    fields: {
      status: { stringValue: status },
      amount: { doubleValue: totalAmount },
      type: { stringValue: order.type || 'point' },
      paymentMethod: { stringValue: paymentMethod.type || 'card' },
      updatedAt: { timestampValue: new Date().toISOString() },
      raw: {
        mapValue: {
          fields: {
            id: { stringValue: id },
            status: { stringValue: status },
            type: { stringValue: order.type || 'point' },
            total_amount: { stringValue: String(totalAmount) },
            created_date: { stringValue: order.created_date || '' },
            payments: {
              arrayValue: {
                values: payments.slice(0, 5).map((p) => {
                  const paymentFields = {
                    id: { stringValue: p.id || '' },
                    status: { stringValue: p.status || '' },
                    amount: { stringValue: String(p.amount || '0') },
                    paid_amount: { stringValue: String(p.paid_amount || '0') },
                  };

                  if (p.payment_method) {
                    paymentFields.payment_method = {
                      mapValue: {
                        fields: {
                          type: { stringValue: p.payment_method.type || 'card' },
                          id: { stringValue: p.payment_method.id || '' },
                          installments: { integerValue: String(p.payment_method.installments || 1) },
                        },
                      },
                    };
                  }

                  return {
                    mapValue: {
                      fields: paymentFields,
                    },
                  };
                }),
              },
            },
          },
        },
      },
    },
  };
}

async function persistPointOrderToFirestore(documentId, order) {
  if (!FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID is missing');
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/webhook_events/${documentId}`
  );
  if (FIREBASE_API_KEY) url.searchParams.set('key', FIREBASE_API_KEY);

  const body = toFirestorePointDocument(order);

  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore write failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function persistToFirestore(documentId, merchantOrder) {
  if (!FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID is missing');
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/webhook_events/${documentId}`
  );
  if (FIREBASE_API_KEY) url.searchParams.set('key', FIREBASE_API_KEY);

  const body = toFirestoreDocument(merchantOrder);

  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore write failed (${res.status}): ${text}`);
  }

  return res.json();
}

app.post('/api/webhooks/mercadopago', async (req, res) => {
  const signatureHeader = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  const xTopic = req.headers['x-topic']; // 'payment' ou 'order'

  const isValid = VALIDATE ? verifySignature(req.rawBody || '', signatureHeader, SECRET) : true;
  if (!isValid) {
    console.warn('[Webhook] Assinatura inválida', { requestId });
    return res.status(401).send('Invalid signature');
  }

  // Estrutura esperada do webhook
  const payload = req.body;
  console.log('[Webhook] Recebido', {
    requestId,
    topic: xTopic,
    action: payload?.action,
    headers: {
      topic: req.headers['x-topic'],
      userId: req.headers['x-user-id'],
    },
    data: payload?.data,
  });
  
  // Para QR: webhook vem com 'payment' topic e payment_id
  // Para Point: webhook vem com 'order' topic e order_id
  
  try {
    // ===== PONTO (INTEGRADO - WEBHOOK ORDER) =====
    if (xTopic === 'order' && payload?.data?.id) {
      const orderId = payload.data.id;
      console.log('[Webhook Point] Processando order:', orderId);
      
      // Fetch order details via API (Point returns order data in webhook)
      const order = await fetchPointOrder(orderId);
      console.log('[Webhook Point] Order details:', {
        orderId,
        status: order.status,
        type: order.type,
        external_reference: order.external_reference,
        payment_method: order.transactions?.payments?.[0]?.payment_method?.type
      });

      // Extrair referência externa (orderId do seu sistema)
      const externalReference = order.external_reference;
      if (!externalReference) {
        console.warn('[Webhook Point] Sem external_reference na order', { orderId });
        return res.status(200).send('OK');
      }

      // Persist Point order to Firestore
      await persistPointOrderToFirestore(externalReference, order);
      console.log('[Webhook Point] Salvo no Firestore:', {
        externalReference,
        orderId,
        status: order.status,
        paymentMethod: order.transactions?.payments?.[0]?.payment_method?.type
      });

      return res.status(200).send('OK');
    }

    // ===== QR/PIX (WEBHOOK PAYMENT) =====
    if ((xTopic === 'payment' || !xTopic) && payload?.data?.id) {
      const paymentId = payload.data.id;
      console.log('[Webhook QR] Processando payment:', paymentId);

      // Fetch payment details
      const payment = await fetchPayment(paymentId);
      console.log('[Webhook QR] Payment details:', {
        paymentId,
        status: payment.status,
        paymentType: payment.payment_method?.type
      });

      // Extract merchant order ID from payment
      const merchantOrderId = payment.order?.id;
      if (!merchantOrderId) {
        console.warn('[Webhook QR] Sem merchant order id no payment', { paymentId, payment });
        return res.status(200).send('OK');
      }

      // Fetch merchant order details
      const merchantOrder = await fetchMerchantOrder(merchantOrderId);
      console.log('[Webhook QR] Merchant order details:', {
        merchantOrderId,
        status: merchantOrder.order_status
      });

      // Extract external_reference (orderId) to use as Firestore document ID
      const externalReference = merchantOrder.external_reference;
      if (!externalReference) {
        console.warn('[Webhook QR] Sem external_reference na merchant order', { merchantOrderId });
        return res.status(200).send('OK');
      }

      // Persist to Firestore using external_reference as document ID
      await persistToFirestore(externalReference, merchantOrder);
      console.log('[Webhook QR] Salvo no Firestore:', {
        externalReference,
        merchantOrderId,
        status: merchantOrder.order_status
      });

      return res.status(200).send('OK');
    }

    console.warn('[Webhook] Formato não reconhecido', { payload, xTopic });
    res.status(200).send('OK');

  } catch (err) {
    console.error('[Webhook] Falha ao processar', { requestId, error: err?.message, stack: err?.stack });
    // Responde 200 para evitar reentregas infinitas; log trata reconciliation manual se necessário
    res.status(200).send('OK');
  }
});

app.listen(PORT, () => {
  console.log(`Webhook server listening on http://localhost:${PORT}`);
});
