/**
 * ============================================================================
 * Invitations - Send Email
 * ============================================================================
 * 
 * Callable function para enviar email de convite.
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';
import { db, admin, requireAuth, requireManager, serverTimestamp } from '../lib';

interface SendInvitationData {
  email: string;
  role: string;
  storeId?: string | null;
  invitationId?: string;
}

export const sendInvitationEmail = functions.https.onCall(async (data: SendInvitationData, context) => {
  // 🔧 v4.0.7: Usando helpers centralizados
  requireAuth(context);
  requireManager(context);
  
  const callerClaims = context.auth!.token;
  
  // Verifica permissão (owner, admin ou manager podem convidar)
  if (!['owner', 'admin', 'manager'].includes(callerClaims.role as string)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Você não tem permissão para enviar convites'
    );
  }
  
  const { email, role, storeId, invitationId } = data;
  
  if (!email || !role) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'email e role são obrigatórios'
    );
  }
  
  // 🔧 v4.0.7: Validação de formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Formato de email inválido'
    );
  }
  
  // 🔧 v4.0.7: Validação de role permitida
  const validRoles = ['admin', 'manager', 'operator', 'employee', 'technician', 'viewer'];
  if (!validRoles.includes(role)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Role inválida. Permitidas: ${validRoles.join(', ')}`
    );
  }
  
  try {
    const franchiseId = callerClaims.franchiseId as string;
    
    // Busca dados da franquia
    const franchiseDoc = await db.collection('franchises').doc(franchiseId).get();
    if (!franchiseDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Franquia não encontrada');
    }
    const franchise = franchiseDoc.data()!;
    
    // Busca ou cria o convite
    let invitation: {
      email: string;
      role: string;
      franchiseId: string;
      storeId: string | null;
      invitedBy: string;
      status: string;
      token: string;
      createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
      expiresAt: FirebaseFirestore.Timestamp;
    };
    let inviteRef: FirebaseFirestore.DocumentReference;
    
    if (invitationId) {
      inviteRef = db.collection('invitations').doc(invitationId);
      const inviteDoc = await inviteRef.get();
      if (!inviteDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Convite não encontrado');
      }
      invitation = inviteDoc.data() as typeof invitation;
    } else {
      // Verifica se já existe convite pendente
      const existingInvite = await db
        .collection('invitations')
        .where('email', '==', email.toLowerCase())
        .where('franchiseId', '==', franchiseId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      
      if (!existingInvite.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Já existe um convite pendente para este email'
        );
      }
      
      // Cria novo convite
      const token = generateToken();
      inviteRef = db.collection('invitations').doc();
      invitation = {
        email: email.toLowerCase(),
        role,
        franchiseId,
        storeId: storeId || null,
        invitedBy: context.auth!.uid,
        status: 'pending',
        token,
        createdAt: serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias
        ),
      };
      await inviteRef.set(invitation);
    }
    
    // Configura transporter do nodemailer
    // Em produção, usar as credenciais reais do SMTP
    const smtpConfig = functions.config().smtp || {
      host: 'smtp.gmail.com',
      port: 587,
      user: '',
      pass: '',
    };
    
    if (!smtpConfig.user || !smtpConfig.pass) {
      functions.logger.warn('SMTP não configurado, pulando envio de email');
      return { 
        success: true, 
        invitationId: inviteRef.id,
        message: 'Convite criado. Email não enviado (SMTP não configurado).' 
      };
    }
    
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: parseInt(smtpConfig.port),
      secure: false,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });
    
    // URL do convite
    const inviteUrl = `${functions.config().app?.url || 'https://admin.openkiosk.app'}/invite/${invitation.token}`;
    
    // Envia o email
    await transporter.sendMail({
      from: `"Open Kiosk" <${smtpConfig.user}>`,
      to: email,
      subject: `Convite para ${franchise.name} - Open Kiosk`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Você foi convidado!</h2>
          <p>Você foi convidado para fazer parte de <strong>${franchise.name}</strong> como <strong>${getRoleLabel(role)}</strong>.</p>
          <p style="margin: 30px 0;">
            <a href="${inviteUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Aceitar Convite
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            Este convite expira em 7 dias.<br>
            Se você não esperava este email, pode ignorá-lo.
          </p>
        </div>
      `,
    });
    
    // Atualiza status do convite
    await inviteRef.update({
      emailSentAt: serverTimestamp(),
    });
    
    functions.logger.info(`Convite enviado para ${email}`);
    
    return { success: true, invitationId: inviteRef.id };
    
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error('Erro ao enviar convite:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Erro interno ao processar o convite'
    );
  }
});

/**
 * 🔧 v4.0.7: Gera token criptograficamente seguro
 * Usando crypto.randomBytes em vez de Math.random() para segurança
 */
function generateToken(): string {
  // Usar crypto.randomBytes para segurança criptográfica
  const { randomBytes } = require('crypto');
  return randomBytes(24).toString('base64url'); // 32 chars, URL-safe
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    owner: 'Proprietário',
    admin: 'Administrador',
    manager: 'Gerente',
    employee: 'Funcionário',
    operator: 'Operador',
    technician: 'Técnico',
    viewer: 'Visualizador',
  };
  return labels[role] || role;
}
