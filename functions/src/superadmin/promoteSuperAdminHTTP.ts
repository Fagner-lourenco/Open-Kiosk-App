/**
 * ============================================================================
 * HTTP Endpoint temporário para promover Super Admin
 * ============================================================================
 * 
 * 🔧 v4.0.7: Correções de segurança aplicadas:
 * - Secret movido para Firebase Functions Config (não hardcoded)
 * - Secret enviado via POST body (não query string)
 * - Endpoint desabilitado por padrão
 * 
 * Para habilitar:
 * 1. firebase functions:config:set superadmin.secret="SUA_SENHA_SECRETA"
 * 2. firebase functions:config:set superadmin.enabled="true"
 * 3. firebase deploy --only functions:promoteSuperAdminHTTP
 * 
 * Uso:
 * curl -X POST https://us-central1-open-kiosk-22b2b.cloudfunctions.net/promoteSuperAdminHTTP \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"SEU_EMAIL","secret":"SUA_SENHA"}'
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db, auth, serverTimestamp } from '../lib';

// 🔧 v4.0.7: Secret agora vem do Firebase Functions Config
const getSecret = (): string | null => {
  try {
    return process.env.SUPERADMIN_SECRET || null;
  } catch {
    return null;
  }
};

const isEnabled = (): boolean => {
  try {
    return process.env.SUPERADMIN_ENABLED === 'true';
  } catch {
    return false;
  }
};

export const promoteSuperAdminHTTP = onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // 🔧 v4.0.7: Verificar se endpoint está habilitado
  if (!isEnabled()) {
    res.status(403).send('❌ Endpoint desabilitado. Configure superadmin.enabled=true');
    return;
  }
  
  // 🔧 v4.0.7: Apenas POST (secret no body, não na query string)
  if (req.method !== 'POST') {
    res.status(405).send('❌ Método não permitido. Use POST com body JSON.');
    return;
  }
  
  const { email, secret } = req.body || {};
  const configSecret = getSecret();
  
  // Validação do secret
  if (!configSecret) {
    res.status(500).send('❌ Secret não configurado. Execute: firebase functions:config:set superadmin.secret="..."');
    return;
  }
  
  if (secret !== configSecret) {
    res.status(403).send('❌ Acesso negado: secret inválido');
    return;
  }
  
  if (!email) {
    res.status(400).send('❌ Parâmetro "email" é obrigatório');
    return;
  }
  
  try {
    // Buscar usuário pelo email
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;
    
    logger.info(`Promovendo ${email} (${uid}) a super admin via HTTP`);
    
    // Atualizar custom claims
    await auth.setCustomUserClaims(uid, {
      role: 'superadmin',
      franchiseId: null,
      storeId: null,
    });
    
    // Criar documento na coleção superadmins
    await db.collection('superadmins').doc(uid).set({
      email,
      displayName: userRecord.displayName || null,
      photoURL: userRecord.photoURL || null,
      createdAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
      });
    } else {
      await userDoc.set({
        email,
        displayName: userRecord.displayName || null,
        photoURL: userRecord.photoURL || null,
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
        createdAt: serverTimestamp(),
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
    logger.error('Erro ao promover super admin:', error);
    
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
