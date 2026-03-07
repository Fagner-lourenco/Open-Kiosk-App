/**
 * Aplica CORS no bucket Firebase Storage usando token do Firebase CLI.
 * 
 * Uso: node scripts/set-storage-cors.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const BUCKET = 'open-kiosk-22b2b.firebasestorage.app';

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
      'x-goog-meta-*',
    ],
    maxAgeSeconds: 3600,
  },
];

function getFirebaseToken() {
  // Try configstore path (firebase-tools stores tokens here)
  const configPaths = [
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json'),
  ];

  for (const p of configPaths) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data.tokens && data.tokens.access_token) {
        return data.tokens.access_token;
      }
      // Also check refresh_token for re-auth
      if (data.tokens && data.tokens.refresh_token) {
        console.log('Found refresh_token but no access_token at:', p);
      }
    } catch (e) {
      // Try next path
    }
  }
  return null;
}

function patchCors(accessToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ cors: CORS_CONFIG });
    const options = {
      hostname: 'storage.googleapis.com',
      path: `/storage/v1/b/${encodeURIComponent(BUCKET)}?fields=cors`,
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

function getCors(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'storage.googleapis.com',
      path: `/storage/v1/b/${encodeURIComponent(BUCKET)}?fields=cors`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
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
    req.end();
  });
}

async function run() {
  console.log('Looking for Firebase CLI token...');
  const token = getFirebaseToken();
  
  if (!token) {
    // Fallback: use firebase-tools programmatically
    console.log('No configstore token found. Trying firebase-tools module...');
    try {
      const fbToolsPath = require.resolve('firebase-tools', { paths: [process.cwd(), path.join(process.cwd(), 'node_modules')] });
      const firebase = require(fbToolsPath);
      const accounts = await firebase.login.list();
      if (accounts && accounts.length > 0) {
        const fbToken = accounts[0].tokens.access_token;
        console.log('Got token from firebase-tools login.list()');
        return await applyAndVerify(fbToken);
      }
    } catch (e) {
      console.error('firebase-tools fallback failed:', e.message);
    }
    console.error('ERROR: No Firebase CLI token found. Run "npx firebase login" first.');
    process.exit(1);
  }
  
  return await applyAndVerify(token);
}

async function applyAndVerify(token) {
  console.log(`\nApplying CORS to bucket: ${BUCKET}`);
  console.log('Origins:', CORS_CONFIG[0].origin);
  
  try {
    const result = await patchCors(token);
    console.log('\n✅ CORS applied successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('\n❌ Failed to apply CORS:', e.message);
    process.exit(1);
  }
  
  // Verify
  try {
    const current = await getCors(token);
    console.log('\nVerification - current CORS config:');
    console.log(JSON.stringify(current, null, 2));
  } catch (e) {
    console.warn('Could not verify:', e.message);
  }
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
