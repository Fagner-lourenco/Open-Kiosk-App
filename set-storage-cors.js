/**
 * Aplica configuração CORS no bucket Firebase Storage usando @google-cloud/storage.
 * Execução: node set-storage-cors.js <ACCESS_TOKEN>
 *
 * Obter o token com:  npx firebase login:ci --no-localhost
 * Ou usar GOOGLE_APPLICATION_CREDENTIALS com um service account.
 */

const https = require('https');

const BUCKET = 'open-kiosk-22b2b.firebasestorage.app';
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error('Uso: node set-storage-cors.js <ACCESS_TOKEN>');
  console.error('');
  console.error('Obter token:');
  console.error('  npx firebase login:ci --no-localhost');
  process.exit(1);
}

const corsConfig = [
  {
    origin: [
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

const body = JSON.stringify({ cors: corsConfig });

const options = {
  hostname: 'storage.googleapis.com',
  path: `/storage/v1/b/${encodeURIComponent(BUCKET)}?fields=cors`,
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

console.log(`Aplicando CORS no bucket: ${BUCKET}`);
console.log('Origens permitidas:', corsConfig[0].origin.join(', '));

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('\n✅ CORS configurado com sucesso!');
      const result = JSON.parse(data);
      console.log('Configuração aplicada:', JSON.stringify(result.cors, null, 2));
    } else {
      console.error(`\n❌ Erro ${res.statusCode}:`, data);
    }
  });
});

req.on('error', (e) => {
  console.error('Erro na requisição:', e.message);
});

req.write(body);
req.end();
