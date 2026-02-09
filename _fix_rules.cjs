const fs = require('fs');
const p = 'd:/Open-Kiosk-App/firestore.rules';
let c = fs.readFileSync(p, 'utf8');

// Find the closing brace of stores match block (after metrics)
// Look for the pattern: "allow write: if false;\r\n        }\r\n      }"
// which is the metrics close + stores close

const searchPattern = 'allow write: if false;\r\n        }\r\n      }';
const idx = c.indexOf(searchPattern);
if (idx === -1) {
  console.log('Pattern not found, trying without \\r');
  const idx2 = c.indexOf('allow write: if false;\n        }\n      }');
  console.log('Without \\r:', idx2);
  process.exit(1);
}

// Find the SECOND occurrence (the one inside stores, not an earlier one)
const firstIdx = idx;
const secondIdx = c.indexOf(searchPattern, firstIdx + 1);

// Use the last one inside the stores block
const targetIdx = secondIdx !== -1 ? secondIdx : firstIdx;

// We want to insert BEFORE "      }" (the closing of stores match)
// So find the position right after "        }" (closing metrics) and before "      }" (closing stores)
const insertPoint = targetIdx + 'allow write: if false;\r\n        }'.length;

const newRules = `\r
\r
        // ────────────────────────────────────────────────────────────────────\r
        // TAPS (Estado Operacional das Torneiras - ERP Chopp)\r
        // ────────────────────────────────────────────────────────────────────\r
\r
        match /taps/{tapId} {\r
          allow read: if isSuperAdmin() ||\r
                        isFranchiseOwner(franchiseId) ||\r
                        hasStoreAccess(franchiseId, storeId);\r
\r
          allow create, update: if isSuperAdmin() ||\r
                                  isFranchiseOwner(franchiseId) ||\r
                                  canAccessStoreWithRole(franchiseId, storeId, ['owner', 'admin', 'manager', 'technician']);\r
\r
          allow delete: if false;\r
        }\r
\r
        // ────────────────────────────────────────────────────────────────────\r
        // KEGS (Barris - ERP Chopp)\r
        // ────────────────────────────────────────────────────────────────────\r
\r
        match /kegs/{kegId} {\r
          allow read: if isSuperAdmin() ||\r
                        isFranchiseOwner(franchiseId) ||\r
                        hasStoreAccess(franchiseId, storeId);\r
\r
          allow create, update: if isSuperAdmin() ||\r
                                  isFranchiseOwner(franchiseId) ||\r
                                  canAccessStoreWithRole(franchiseId, storeId, ['owner', 'admin', 'manager']);\r
\r
          allow delete: if false;\r
        }\r
\r
        // ────────────────────────────────────────────────────────────────────\r
        // TAP ASSIGNMENTS (Historico de conexao Tap/Keg)\r
        // ────────────────────────────────────────────────────────────────────\r
\r
        match /tapAssignments/{assignmentId} {\r
          allow read: if isSuperAdmin() ||\r
                        isFranchiseOwner(franchiseId) ||\r
                        hasStoreAccess(franchiseId, storeId);\r
\r
          allow create: if isSuperAdmin() ||\r
                          isFranchiseOwner(franchiseId) ||\r
                          canAccessStoreWithRole(franchiseId, storeId, ['owner', 'admin', 'manager']);\r
\r
          allow update: if isSuperAdmin() ||\r
                          isFranchiseOwner(franchiseId) ||\r
                          canAccessStoreWithRole(franchiseId, storeId, ['owner', 'admin', 'manager']);\r
\r
          allow delete: if false;\r
        }\r
\r
        // ────────────────────────────────────────────────────────────────────\r
        // SERVING SESSIONS (Sessoes de Servir - IMUTAVEL)\r
        // ────────────────────────────────────────────────────────────────────\r
\r
        match /servingSessions/{eventId} {\r
          allow read: if isSuperAdmin() ||\r
                        isFranchiseOwner(franchiseId) ||\r
                        hasStoreAccess(franchiseId, storeId);\r
\r
          allow create: if isSuperAdmin() ||\r
                          isFranchiseOwner(franchiseId) ||\r
                          hasStoreAccess(franchiseId, storeId);\r
\r
          // IMUTAVEL: sem update, sem delete\r
          allow update, delete: if false;\r
        }\r
\r
        // ────────────────────────────────────────────────────────────────────\r
        // WASTAGE EVENTS (Perdas - IMUTAVEL)\r
        // ────────────────────────────────────────────────────────────────────\r
\r
        match /wastageEvents/{wastageId} {\r
          allow read: if isSuperAdmin() ||\r
                        isFranchiseOwner(franchiseId) ||\r
                        hasStoreAccess(franchiseId, storeId);\r
\r
          allow create: if isSuperAdmin() ||\r
                          isFranchiseOwner(franchiseId) ||\r
                          canAccessStoreWithRole(franchiseId, storeId, ['owner', 'admin', 'manager']);\r
\r
          // IMUTAVEL: sem update, sem delete\r
          allow update, delete: if false;\r
        }\r
\r
        // ────────────────────────────────────────────────────────────────────\r
        // MAINTENANCE LOGS (Manutencao - update limitado)\r
        // ────────────────────────────────────────────────────────────────────\r
\r
        match /maintenanceLogs/{logId} {\r
          allow read: if isSuperAdmin() ||\r
                        isFranchiseOwner(franchiseId) ||\r
                        hasStoreAccess(franchiseId, storeId);\r
\r
          allow create: if isSuperAdmin() ||\r
                          isFranchiseOwner(franchiseId) ||\r
                          canAccessStoreWithRole(franchiseId, storeId, ['owner', 'admin', 'manager', 'technician']);\r
\r
          allow update: if isSuperAdmin() ||\r
                          isFranchiseOwner(franchiseId) ||\r
                          canAccessStoreWithRole(franchiseId, storeId, ['owner', 'admin', 'manager', 'technician']);\r
\r
          allow delete: if false;\r
        }\r
\r
        // ────────────────────────────────────────────────────────────────────\r
        // NOTIFICATIONS (Notificacoes Operacionais)\r
        // ────────────────────────────────────────────────────────────────────\r
\r
        match /notifications/{notifId} {\r
          allow read: if isSuperAdmin() ||\r
                        isFranchiseOwner(franchiseId) ||\r
                        hasStoreAccess(franchiseId, storeId);\r
\r
          // Apenas Cloud Functions criam notificacoes\r
          allow create: if false;\r
\r
          // Membros podem marcar como lida\r
          allow update: if isSuperAdmin() ||\r
                          isFranchiseOwner(franchiseId) ||\r
                          hasStoreAccess(franchiseId, storeId);\r
\r
          allow delete: if false;\r
        }`;

c = c.substring(0, insertPoint) + newRules + c.substring(insertPoint);
fs.writeFileSync(p, c);
console.log('Updated firestore.rules, now', c.split('\n').length, 'lines');
