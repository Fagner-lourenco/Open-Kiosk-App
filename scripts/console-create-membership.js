/**
 * ============================================================================
 * SCRIPT PARA CRIAR MEMBERSHIP - COPIE E COLE NO CONSOLE DO NAVEGADOR
 * ============================================================================
 * 
 * Instruções:
 * 1. Abra o Admin (http://localhost:5174) e faça login
 * 2. Abra o Console do Desenvolvedor (F12)
 * 3. Cole todo o conteúdo abaixo e pressione Enter
 * 
 * ============================================================================
 */

(async () => {
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const db = getFirestore();
  
  // ⚠️ CONFIGURAÇÃO - Altere conforme necessário
  const franchiseId = 'teste_migracao';
  const userId = '0TjY2WIWoqTtadgU6MbvYE0FRYH3';
  const email = 'fagner.alexandro@hotmail.com';
  const displayName = 'Fagner Alexandro';
  const role = 'owner';
  const storeAccess = ['*'];
  
  console.log('🚀 Criando membership...');
  console.log(`   Franquia: ${franchiseId}`);
  console.log(`   Usuário: ${email}`);
  console.log(`   Role: ${role}`);
  
  try {
    await setDoc(doc(db, `franchises/${franchiseId}/members/${userId}`), {
      userId,
      email,
      displayName,
      role,
      storeAccess,
      invitedBy: userId,
      invitedAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
      isActive: true,
    });
    
    console.log('');
    console.log('✅ Membership criado com sucesso!');
    console.log(`   Path: franchises/${franchiseId}/members/${userId}`);
    console.log('');
    console.log('🔄 Agora atualize a página do Kiosk (http://localhost:5173) e faça login.');
  } catch (error) {
    console.error('❌ Erro:', error);
  }
})();
