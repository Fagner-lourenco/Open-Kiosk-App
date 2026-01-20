/**
 * ============================================================================
 * Script: Criar Membership Manual para Teste
 * ============================================================================
 * 
 * Cria um documento de membership diretamente no Firestore para teste imediato.
 * Execute no console do navegador (Kiosk ou Admin após login).
 * 
 * Uso:
 *   1. Abra o console do navegador
 *   2. Cole este script e execute
 */

const createTestMembership = async () => {
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const db = getFirestore();

  // ⚠️ CONFIGURAÇÃO - Altere conforme necessário
  const CONFIG = {
    franchiseId: 'teste_migracao',
    userId: '0TjY2WIWoqTtadgU6MbvYE0FRYH3',
    email: 'fagner.alexandro@hotmail.com',
    displayName: 'Fagner Alexandro',
    role: 'owner', // owner | manager | employee | viewer
    storeAccess: ['*'], // ['*'] = todas as lojas
  };

  console.log('🚀 Criando membership de teste...');
  console.log('📋 Configuração:', CONFIG);

  const memberRef = doc(db, `franchises/${CONFIG.franchiseId}/members/${CONFIG.userId}`);

  try {
    await setDoc(memberRef, {
      userId: CONFIG.userId,
      email: CONFIG.email,
      displayName: CONFIG.displayName,
      role: CONFIG.role,
      storeAccess: CONFIG.storeAccess,
      invitedBy: CONFIG.userId, // Auto-convite
      invitedAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
      isActive: true,
    });

    console.log('✅ Membership criado com sucesso!');
    console.log(`   Path: franchises/${CONFIG.franchiseId}/members/${CONFIG.userId}`);
    console.log('');
    console.log('🔄 Atualize a página do Kiosk para testar o login.');

    return { success: true, path: memberRef.path };
  } catch (error) {
    console.error('❌ Erro ao criar membership:', error);
    return { success: false, error };
  }
};

// Executa
createTestMembership();
