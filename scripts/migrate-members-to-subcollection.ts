/**
 * ============================================================================
 * Script: Migrar Membros do Array para Subcollection
 * ============================================================================
 * 
 * Este script migra membros armazenados no array `franchises/{id}.members[]`
 * para a estrutura de subcollection `franchises/{id}/members/{userId}`.
 * 
 * Uso:
 *   1. Abra o console do navegador no Admin (após login)
 *   2. Cole este script e execute
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

// ============================================================================
// SCRIPT PARA CONSOLE DO NAVEGADOR
// ============================================================================

const migrateMembersToSubcollection = async () => {
  // Importa do Firebase já carregado na aplicação
  const { getFirestore, collection, getDocs, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const db = getFirestore();

  console.log('🚀 Iniciando migração de membros para subcollection...');

  // 1. Busca todas as franquias
  const franchisesRef = collection(db, 'franchises');
  const franchisesSnap = await getDocs(franchisesRef);

  let totalMigrated = 0;
  let totalSkipped = 0;
  let errors: string[] = [];

  for (const franchiseDoc of franchisesSnap.docs) {
    const franchiseId = franchiseDoc.id;
    const data = franchiseDoc.data();
    const members = data.members || [];

    console.log(`\n📁 Processando franquia: ${data.name || franchiseId}`);
    console.log(`   Membros no array: ${members.length}`);

    for (const member of members) {
      const userId = member.id;
      if (!userId) {
        console.warn(`   ⚠️ Membro sem ID ignorado:`, member);
        totalSkipped++;
        continue;
      }

      // Verifica se já existe na subcollection
      const memberRef = doc(db, `franchises/${franchiseId}/members/${userId}`);
      
      try {
        const memberDoc = await import('firebase/firestore').then(f => f.getDoc(memberRef));
        
        if (memberDoc.exists()) {
          console.log(`   ⏭️ Membro já existe na subcollection: ${member.email || userId}`);
          totalSkipped++;
          continue;
        }

        // Cria documento na subcollection
        const memberData = {
          userId,
          email: member.email || null,
          displayName: member.displayName || null,
          role: member.role || 'viewer',
          storeAccess: member.storeAccess || ['*'],
          invitedBy: member.invitedBy || data.ownerId || 'system',
          invitedAt: member.addedAt ? new Date(member.addedAt) : serverTimestamp(),
          joinedAt: member.addedAt ? new Date(member.addedAt) : serverTimestamp(),
          isActive: true,
        };

        await setDoc(memberRef, memberData);
        console.log(`   ✅ Migrado: ${member.email || userId} (${member.role})`);
        totalMigrated++;

      } catch (error) {
        const errorMsg = `Erro ao migrar ${member.email || userId}: ${error}`;
        console.error(`   ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTADO DA MIGRAÇÃO');
  console.log('='.repeat(60));
  console.log(`✅ Membros migrados: ${totalMigrated}`);
  console.log(`⏭️ Membros ignorados (já existiam): ${totalSkipped}`);
  console.log(`❌ Erros: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n⚠️ Erros encontrados:');
    errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
  }

  console.log('\n✨ Migração concluída!');
  
  return {
    migrated: totalMigrated,
    skipped: totalSkipped,
    errors,
  };
};

// Executa a migração
migrateMembersToSubcollection();
