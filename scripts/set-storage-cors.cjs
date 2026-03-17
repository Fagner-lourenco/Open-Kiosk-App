/**
 * Applies Firebase Storage CORS using a Firebase CLI token.
 *
 * Usage:
 *   node scripts/set-storage-cors.cjs
 *   FIREBASE_STORAGE_BUCKET=my-bucket.firebasestorage.app node scripts/set-storage-cors.cjs
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const DEFAULT_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'open-kiosk-22b2b.firebasestorage.app';
const BUCKET_CANDIDATES = Array.from(new Set([
  DEFAULT_BUCKET,
  DEFAULT_BUCKET.endsWith('.firebasestorage.app')
    ? DEFAULT_BUCKET.replace(/\.firebasestorage\.app$/i, '.appspot.com')
    : DEFAULT_BUCKET,
]));

const CORS_CONFIG = [
  {
    origin: [
      'https://localhost',
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
      'x-goog-meta-*',
    ],
    maxAgeSeconds: 3600,
  },
];

function getFirebaseToken() {
  const configPaths = [
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json'),
  ];

  for (const configPath of configPaths) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data.tokens?.access_token) {
        return data.tokens.access_token;
      }
    } catch {
      // Try the next path.
    }
  }

  return null;
}

function storageRequest(bucket, method, accessToken, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'storage.googleapis.com',
      path: `/storage/v1/b/${encodeURIComponent(bucket)}?fields=cors`,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };

    if (payload) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve(JSON.parse(data || '{}'));
          return;
        }

        reject(new Error(`GCS API ${response.statusCode}: ${data}`));
      });
    });

    request.on('error', reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

async function resolveBucket(accessToken) {
  for (const bucket of BUCKET_CANDIDATES) {
    try {
      await storageRequest(bucket, 'GET', accessToken);
      return bucket;
    } catch (error) {
      console.warn(`[storage-cors] Bucket candidate unavailable: ${bucket} (${error.message})`);
    }
  }

  throw new Error(`No bucket candidate was reachable. Tried: ${BUCKET_CANDIDATES.join(', ')}`);
}

async function run() {
  console.log('Looking for Firebase CLI token...');
  const token = getFirebaseToken();
  if (!token) {
    console.error('ERROR: No Firebase CLI token found. Run "npx firebase login" first.');
    process.exit(1);
  }

  const bucket = await resolveBucket(token);
  console.log(`Applying CORS to bucket: ${bucket}`);
  console.log('Origins:', CORS_CONFIG[0].origin);

  try {
    const result = await storageRequest(bucket, 'PATCH', token, { cors: CORS_CONFIG });
    console.log('\nCORS applied successfully.');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\nFailed to apply CORS:', error.message);
    process.exit(1);
  }

  try {
    const current = await storageRequest(bucket, 'GET', token);
    console.log('\nVerification - current CORS config:');
    console.log(JSON.stringify(current, null, 2));
  } catch (error) {
    console.warn('Could not verify current bucket CORS:', error.message);
  }
}

run().catch((error) => {
  console.error('Fatal:', error.message);
  process.exit(1);
});
