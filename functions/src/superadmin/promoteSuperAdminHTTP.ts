/**
 * ============================================================================
 * HTTP Endpoint temporário para promover Super Admin
 * ============================================================================
 * 
 * Este endpoint é temporário e deve ser removido após uso.
 * Acesse: https://us-central1-open-kiosk-22b2b.cloudfunctions.net/promoteSuperAdminHTTP?email=SEU_EMAIL&secret=open-kiosk-2024
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Inicializa o app apenas se não estiver inicializado
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Chave secreta temporária para proteção
const TEMP_SECRET = 'open-kiosk-superadmin-2024';

export const promoteSuperAdminHTTP = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  const email = req.query.email as string;
  const secret = req.query.secret as string;
  
  // Validação básica
  if (secret !== TEMP_SECRET) {
    res.status(403).send('❌ Acesso negado: secret inválido');
    return;
  }
  
  if (!email) {
    res.status(400).send('❌ Parâmetro "email" é obrigatório');
    return;
  }
  
  try {
    // Buscar usuário pelo email
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    
    functions.logger.info(`Promovendo ${email} (${uid}) a super admin via HTTP`);
    
    // Atualizar custom claims
    await admin.auth().setCustomUserClaims(uid, {
      role: 'superadmin',
      franchiseId: null,
      storeId: null,
    });
    
    // Criar documento na coleção superadmins
    await db.collection('superadmins').doc(uid).set({
      email,
      displayName: userRecord.displayName || null,
      photoURL: userRecord.photoURL || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'http-endpoint',
      status: 'active',
    });
    
    // Atualizar documento do usuário
    const userDoc = db.collection('users').doc(uid);
    const userSnapshot = await userDoc.get();
    
    if (userSnapshot.exists) {
      await userDoc.update({
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await userDoc.set({
        email,
        displayName: userRecord.displayName || null,
        photoURL: userRecord.photoURL || null,
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
      });
    }
    
    res.status(200).send(`
      <html>
        <head><title>Super Admin Promovido</title></head>
        <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
          <h1>✅ Sucesso!</h1>
          <p><strong>${email}</strong> foi promovido a Super Admin.</p>
          <p style="color: #f59e0b; background: #fef3c7; padding: 12px; border-radius: 8px;">
            ⚠️ <strong>IMPORTANTE:</strong> Faça logout e login novamente no Admin para as permissões serem aplicadas.
          </p>
          <p style="color: #dc2626; margin-top: 20px;">
            🔒 <strong>SEGURANÇA:</strong> Delete esta função após usar! (promoteSuperAdminHTTP)
          </p>
        </body>
      </html>
    `);
    
  } catch (error: unknown) {
    functions.logger.error('Erro ao promover super admin:', error);
    
    if (error instanceof Error && 'code' in error) {
      const authError = error as { code: string };
      if (authError.code === 'auth/user-not-found') {
        res.status(404).send(`❌ Usuário com email ${email} não encontrado. Certifique-se de que já se registrou.`);
        return;
      }
    }
    
    res.status(500).send('❌ Erro interno ao promover super admin');
  }
});
