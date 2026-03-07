/**
 * Função temporária para aplicar CORS no bucket Firebase Storage.
 * Usa o access token do service account via metadata server do GCP.
 *
 * Chame UMA VEZ via POST:
 *   curl -X POST <URL> -H "x-cors-setup-token: cors-setup-2026-open-kiosk"
 *
 * Após uso, remova a exportação de index.ts e faça novo deploy.
 */
import { onRequest } from 'firebase-functions/v2/https';
import * as https from 'https';
import * as http from 'http';

/** Obtém access token do service account via metadata server */
function getAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: 'metadata.google.internal',
      path: '/computeMetadata/v1/instance/service-accounts/default/token',
      method: 'GET',
      headers: { 'Metadata-Flavor': 'Google' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.access_token);
        } catch (e) {
          reject(new Error(`Failed to parse token: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** Chama GCS JSON API para setar CORS */
function setCorsViaRestApi(accessToken: string, bucket: string, cors: object[]): Promise<object> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ cors });
    const options: https.RequestOptions = {
      hostname: 'storage.googleapis.com',
      path: `/storage/v1/b/${encodeURIComponent(bucket)}?fields=cors`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GCS API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const CORS_CONFIG = [
  {
    origin: [
      'https://admin-kappa-five-12.vercel.app',
      'https://*.vercel.app',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://localhost:4173',
      'http://localhost:8080',
    ],
    method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    responseHeader: [
      'Content-Type',
      'Content-Length',
      'Access-Control-Allow-Origin',
      'Authorization',
      'x-goog-resumable',
    ],
    maxAgeSeconds: 3600,
  },
];

export const setStorageCors = onRequest(
  { region: 'southamerica-east1', timeoutSeconds: 30 },
  async (req, res) => {
    const token = req.headers['x-cors-setup-token'] || req.query['token'];
    if (token !== 'cors-setup-2026-open-kiosk') {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const accessToken = await getAccessToken();

      // Diagnóstico: tentar buckets com formatos diferentes
      const bucketsToTry = [
        'open-kiosk-22b2b.firebasestorage.app',
        'open-kiosk-22b2b.appspot.com',
      ];

      const diagnostics: Record<string, string> = {};

      // Primeiro descobrir qual bucket existe
      for (const b of bucketsToTry) {
        try {
          const result = await new Promise<{ err?: string; status?: number }>((resolve) => {
            const options: https.RequestOptions = {
              hostname: 'storage.googleapis.com',
              path: `/storage/v1/b/${encodeURIComponent(b)}?fields=name`,
              method: 'GET',
              headers: { 'Authorization': `Bearer ${accessToken}` },
            };
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', (c) => { data += c; });
              res.on('end', () => resolve({ status: res.statusCode, err: data }));
            });
            req.on('error', (e) => resolve({ err: e.message }));
            req.end();
          });
          diagnostics[b] = `HTTP ${result.status}: ${result.err?.substring(0, 100)}`;
        } catch (e: any) {
          diagnostics[b] = e.message;
        }
      }

      // Tentar setar CORS no bucket que retornar 200
      for (const b of bucketsToTry) {
        try {
          const corsResult = await setCorsViaRestApi(accessToken, b, CORS_CONFIG);
          res.json({ success: true, bucket: b, result: corsResult, diagnostics });
          return;
        } catch (e: any) {
          diagnostics[`cors_${b}`] = e.message;
        }
      }

      res.status(500).json({ error: 'Nenhum bucket acessível', diagnostics });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
