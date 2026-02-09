const fs = require('fs');
const p = 'd:/Open-Kiosk-App/src/lib/pathResolver.ts';
let c = fs.readFileSync(p, 'utf8');
const old = "  | 'metrics';";
const rep = "  | 'metrics'\n  | 'taps'\n  | 'kegs'\n  | 'tapAssignments'\n  | 'servingSessions'\n  | 'wastageEvents'\n  | 'maintenanceLogs'\n  | 'notifications';";
if (c.includes(old)) {
  c = c.replace(old, rep);
  fs.writeFileSync(p, c);
  console.log('Updated pathResolver.ts');
} else {
  console.log('Pattern not found, checking...');
  console.log(c.includes("'taps'") ? 'Already updated' : 'NOT found');
}
