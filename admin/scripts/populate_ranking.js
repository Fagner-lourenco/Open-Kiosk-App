import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, addDoc, Timestamp, query, where } from 'firebase/firestore';

// Configuração do Firebase
// Obs: Em produção isso viria de .env, mas para este script standalone usamos hardcoded
// baseado no .env do projeto
const firebaseConfig = {
  apiKey: "AIzaSyCaRS-fnWiUwNtPjlCmcIzlz4003lDdP8s",
  authDomain: "open-kiosk-22b2b.firebaseapp.com",
  projectId: "open-kiosk-22b2b",
  storageBucket: "open-kiosk-22b2b.firebasestorage.app",
  messagingSenderId: "66190112514",
  appId: "1:66190112514:web:7971482f37a9af47ebb41b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CUSTOMERS = [
  "João Silva", "Maria Oliveira", "Pedro Santos", "Ana Costa",
  "Carlos Pereira", "Fernanda Lima", "Rafael Souza", "Patrícia Gomes",
  "Lucas Alves", "Juliana Mendes", "Roberto Ferreira", "Camila Rocha",
  "Gustavo Martins", "Amanda Ribeiro", "Bruno Carvalho"
];

const DRINKS = [
  { title: "Pilsen Artesanal - 500ml", price: 15.00, ml: 500 },
  { title: "IPA Lupulada - 500ml", price: 22.00, ml: 500 },
  { title: "Stout Cremosa - 400ml", price: 18.00, ml: 400 },
  { title: "Weiss Trigo - 500ml", price: 16.50, ml: 500 },
  { title: "Chopp Black - 300ml", price: 12.00, ml: 300 }
];

function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function authenticate() {
  const email = process.env.POPULATE_EMAIL;
  const password = process.env.POPULATE_PASSWORD;

  if (email && password) {
    try {
      console.log(`🔐 Tentando autenticar como: ${email}...`);
      await signInWithEmailAndPassword(auth, email, password);
      console.log("🔓 Autenticado com sucesso!");
      return;
    } catch (e) {
      console.warn("⚠️ Falha na autenticação por email/senha:", e.message);
    }
  }

  try {
    console.log("👻 Tentando autenticação anônima...");
    await signInAnonymously(auth);
    console.log("🔓 Autenticado como anônimo!");
  } catch (e) {
    console.error("❌ Falha na autenticação:", e.message);
    throw e;
  }
}

async function main() {
  await authenticate();

  console.log("🔍 Iniciando busca da loja 'Dev Kiosk'...");
  
  // 1. Encontrar a loja
  let franchiseId = null;
  let storeId = null;

  try {
    // Busca franchises do usuário atual
    // Como as regras de segurança impedem listar TODAS as franquias (getDocs(collection('franchises'))),
    // precisamos ser mais espertos.
    // O usuário 'fagner' provavelmente é dono ou membro.
    
    // Tentativa 1: Buscar franquias onde sou owner
    console.log("Procurando franchises onde sou ownerId...");
    const qOwner = query(collection(db, 'franchises'), where("ownerId", "==", auth.currentUser.uid));
    const ownerSnap = await getDocs(qOwner);
    
    let userFranchises = [...ownerSnap.docs];

    // Se não achou como owner, teríamos que buscar onde sou membro.
    // Mas a estrutura de subcollection /franchises/{id}/members requer saber o ID da franquia antes.
    // Vamos assumir que listamos as franquias que retornaram.
    
    if (userFranchises.length === 0) {
        console.log("⚠️ Nenhuma franquia encontrada como Owner. Tentando listar todas (modo superadmin ou teste)...");
        // Fallback: Tenta listar tudo se as regras permitirem (pode falhar se não for superadmin)
        const allSnap = await getDocs(collection(db, 'franchises'));
        userFranchises = allSnap.docs;
    }

    console.log(`Encontradas ${userFranchises.length} franquias acessíveis.`);

    // Busca em cada franquia acessível
    for (const doc of userFranchises) {
      console.log(`Verificando franquia: ${doc.id}`);
      const storesRef = collection(db, `franchises/${doc.id}/stores`);
      const storesSnap = await getDocs(storesRef);
      
      for (const storeDoc of storesSnap.docs) {
        const data = storeDoc.data();
        // Verifica nome exato ou case-insensitive
        if (data.name === 'Dev Kiosk' || data.name?.toLowerCase() === 'dev kiosk') {
          franchiseId = doc.id;
          storeId = storeDoc.id;
          console.log(`✅ Loja encontrada!\n📍 Franquia ID: ${franchiseId}\n📍 Loja ID: ${storeId}`);
          break;
        }
      }
      if (storeId) break;
    }
  } catch (err) {
    console.error("Erro ao buscar lojas:", err);
    process.exit(1);
  }

  if (!storeId) {
    console.error("❌ Loja 'Dev Kiosk' não encontrada no banco de dados.");
    console.log("Certifique-se de que a loja foi criada via UI ou crie-a manualmente.");
    process.exit(1);
  }

  // 2. Criar 100 pedidos
  const ordersPath = `franchises/${franchiseId}/stores/${storeId}/orders`;
  const ordersCol = collection(db, ordersPath);

  console.log(`\n📦 Gerando 100 pedidos em: ${ordersPath}`);

  const totalToCreate = 100;
  let created = 0;

  for (let i = 0; i < totalToCreate; i++) {
    const customer = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
    const drink = DRINKS[Math.floor(Math.random() * DRINKS.length)];
    const quantity = Math.floor(Math.random() * 3) + 1; // 1 a 3 unidades
    
    // Distribuição deDATAS
    const r = Math.random();
    let date = new Date();
    
    if (r < 0.6) {
      // 60% Hoje (ranking "Ao Vivo")
      // Horário aleatório nas últimas 5 horas
      date.setHours(date.getHours() - Math.floor(Math.random() * 5));
      date.setMinutes(Math.floor(Math.random() * 60));
    } else if (r < 0.9) {
      // 30% Ontem
      date.setDate(date.getDate() - 1);
      date.setHours(Math.floor(Math.random() * 23));
    } else {
      // 10% Antes de ontem (não deve aparecer no filtro "Hoje")
      date.setDate(date.getDate() - 3);
    }

    const totalVal = drink.price * quantity;

    const order = {
      customerName: customer,
      // Gera um CPF falso simples ou ID para agrupar corretamenet
      customerIdentification: `ID-${customer.replace(/\s+/g, '-').toUpperCase()}`,
      status: 'completed',
      total: totalVal,
      date: toYMD(date), // Campo canônico usado pelos agregadores/ranking
      timestamp: Timestamp.fromDate(date), // Campo 'timestamp' Firestore (preferido)
      items: [
        {
          productId: `prod-${Math.random().toString(36).substr(2, 5)}`,
          title: drink.title,
          price: drink.price,
          quantity: quantity,
          mlPerUnit: drink.ml
        }
      ]
    };

    try {
      await addDoc(ordersCol, order);
      created++;
      if (created % 10 === 0) process.stdout.write('█');
    } catch (e) {
      console.error(`Erro ao criar pedido ${i}:`, e);
    }
  }

  console.log(`\n\n✅ Sucesso! ${created} pedidos foram inseridos.`);
  console.log("Agora você pode testar o Ranking na UI.");
  process.exit(0);
}

main().catch(console.error);
