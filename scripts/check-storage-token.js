const https = require('https');
const path = require('path');
const fbPath = process.env.FB_PATH;
const firebase = require(fbPath);

async function run() {
  const accounts = await firebase.login.list();
  if (!accounts || !accounts.length) {
    console.log('No accounts found');
    return;
  }
  const token = accounts[0].tokens.access_token;
  console.log('Token prefix:', token.substring(0, 20));

  // Check token scopes
  await new Promise((resolve) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: '/oauth2/v3/tokeninfo?access_token=' + token,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log('Scopes:', parsed.scope);
          console.log('Email:', parsed.email);
        } catch(e) {
          console.log('Raw:', data.substring(0, 300));
        }
        resolve();
      });
    });
    req.on('error', e => { console.error('Error:', e.message); resolve(); });
    req.end();
  });

  // Try to list buckets in the project
  await new Promise((resolve) => {
    const req = https.request({
      hostname: 'storage.googleapis.com',
      path: '/storage/v1/b?project=open-kiosk-22b2b&maxResults=5&fields=items(name)',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log('List buckets status:', res.statusCode);
        console.log('Buckets:', data.substring(0, 500));
        resolve();
      });
    });
    req.on('error', e => { console.error('Error:', e.message); resolve(); });
    req.end();
  });
}

run().catch(e => console.error('Fatal:', e.message));
