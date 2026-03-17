/**
 * Applies Firebase Storage CORS using a raw access token.
 *
 * Usage:
 *   node set-storage-cors.js <ACCESS_TOKEN>
 *   FIREBASE_STORAGE_BUCKET=my-bucket.firebasestorage.app node set-storage-cors.js <ACCESS_TOKEN>
 */

const https = require('https');

const PRIMARY_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'open-kiosk-22b2b.firebasestorage.app';
const BUCKET_CANDIDATES = Array.from(new Set([
  PRIMARY_BUCKET,
  PRIMARY_BUCKET.endsWith('.firebasestorage.app')
    ? PRIMARY_BUCKET.replace(/\.firebasestorage\.app$/i, '.appspot.com')
    : PRIMARY_BUCKET,
]));

const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error('Uso: node set-storage-cors.js <ACCESS_TOKEN>');
  console.error('Obter token: npx firebase login:ci --no-localhost');
  process.exit(1);
}

const corsConfig = [
  {
    origin: [
      'https://localhost',
      'https://admin-kappa-five-12.vercel.app',
      'https://*.vercel.app',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://localhost:4173',
    ],
    method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    responseHeader: [
      'Content-Type',
      'Content-Length',
      'Access-Control-Allow-Origin',
      'Authorization',
      'x-goog-resumable',
      'x-goog-meta-*',
    ],
    maxAgeSeconds: 3600,
  },
];

function request(bucket, method) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ cors: corsConfig });
    const options = {
      hostname: 'storage.googleapis.com',
      path: `/storage/v1/b/${encodeURIComponent(bucket)}?fields=cors`,
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    };

    if (method === 'PATCH') {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data || '{}'));
        } else {
          reject(new Error(`Erro ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (method === 'PATCH') {
      req.write(body);
    }
    req.end();
  });
}

(async () => {
  let bucket = null;

  for (const candidate of BUCKET_CANDIDATES) {
    try {
      await request(candidate, 'GET');
      bucket = candidate;
      break;
    } catch (error) {
      console.warn(`Bucket indisponivel: ${candidate} (${error.message})`);
    }
  }

  if (!bucket) {
    console.error(`Nenhum bucket acessivel encontrado. Tentados: ${BUCKET_CANDIDATES.join(', ')}`);
    process.exit(1);
  }

  console.log(`Aplicando CORS no bucket: ${bucket}`);
  console.log('Origens permitidas:', corsConfig[0].origin.join(', '));

  try {
    const result = await request(bucket, 'PATCH');
    console.log('\nCORS configurado com sucesso!');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\nFalha ao aplicar CORS:', error.message);
    process.exit(1);
  }
})();
