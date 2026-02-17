/**
 * Audit script — cross-checks all imports from test files to production files.
 * Detects: ghosts (resolved but don't exist), uncovered files, import consistency.
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules','dist','build','.git','coverage','.firebase',
  '.vite','.turbo','.next','.cache','firmware','android','patches','public'
]);

function walkProd(dir, base) {
  let r = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = path.join(base, e.name).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (rel.includes('__tests__') || rel.includes('__mocks__')) continue;
        r = r.concat(walkProd(path.join(dir, e.name), rel));
      } else if (
        /\.(ts|tsx)$/.test(e.name) &&
        !e.name.endsWith('.d.ts') &&
        !e.name.endsWith('.test.ts') &&
        !e.name.endsWith('.test.tsx') &&
        !e.name.endsWith('.spec.ts') &&
        !e.name.includes('setupTests') &&
        !e.name.includes('test-utils') &&
        !e.name.includes('vitest.') &&
        !e.name.includes('vite.config') &&
        !e.name.includes('tailwind.config') &&
        !e.name.includes('postcss.config') &&
        !e.name.includes('capacitor.config') &&
        !e.name.includes('eslint.')
      ) {
        r.push(rel);
      }
    }
  } catch(e) {}
  return r;
}

function walkTests(dir, base) {
  let r = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = path.join(base, e.name).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        r = r.concat(walkTests(path.join(dir, e.name), rel));
      } else if (/\.(test|spec)\.(ts|tsx)$/.test(e.name)) {
        r.push(rel);
      }
    }
  } catch(e) {}
  return r;
}

const areas = {
  functions: walkProd('functions/src', 'functions/src'),
  admin: walkProd('admin/src', 'admin/src'),
  kiosk: walkProd('src', 'src'),
  shared: walkProd('shared', 'shared'),
  adminShared: walkProd('admin/shared', 'admin/shared'),
};

const testFiles = [
  ...walkTests('functions/src/__tests__', 'functions/src/__tests__'),
  ...walkTests('admin/src/__tests__', 'admin/src/__tests__'),
  ...walkTests('admin/shared/utils/__tests__', 'admin/shared/utils/__tests__'),
  ...walkTests('shared/__tests__', 'shared/__tests__'),
  ...walkTests('src/__tests__', 'src/__tests__'),
];

function resolveAlias(imp, tf) {
  if (imp.startsWith('@shared/')) {
    return path.normalize(path.join('admin/shared', imp.slice(8))).replace(/\\/g, '/');
  }
  if (imp.startsWith('@/')) {
    const normTf = tf.replace(/\\/g, '/');
    if (normTf.startsWith('admin/')) {
      return path.normalize(path.join('admin/src', imp.slice(2))).replace(/\\/g, '/');
    }
    return path.normalize(path.join('src', imp.slice(2))).replace(/\\/g, '/');
  }
  return null;
}

function resolveFile(resolved) {
  if (resolved.endsWith('.ts') || resolved.endsWith('.tsx')) return resolved;
  if (fs.existsSync(resolved + '.ts')) return resolved + '.ts';
  if (fs.existsSync(resolved + '.tsx')) return resolved + '.tsx';
  if (fs.existsSync(resolved + '/index.ts')) return resolved + '/index.ts';
  if (fs.existsSync(resolved + '/index.tsx')) return resolved + '/index.tsx';
  return resolved;
}

const exercised = new Set();
const importMap = {};
const ghosts = [];

for (const tf of testFiles) {
  try {
    const content = fs.readFileSync(tf, 'utf8');
    
    // Relative imports
    const relImports = [
      ...content.matchAll(/from\s+['"](\.\.[^'"]+)['"]/g),
      ...content.matchAll(/import\s*\(\s*['"](\.\.[^'"]+)['"]\s*\)/g),
      ...content.matchAll(/^import\s+['"](\.\.[^'"]+)['"]\s*;/gm),
    ];
    for (const m of relImports) {
      const testDir = path.dirname(tf);
      let resolved = resolveFile(path.normalize(path.join(testDir, m[1])).replace(/\\/g, '/'));
      exercised.add(resolved);
      if (!importMap[resolved]) importMap[resolved] = [];
      importMap[resolved].push(tf);
    }
    
    // Alias imports
    const aliasImports = [
      ...content.matchAll(/from\s+['"](@[^'"]+)['"]/g),
      ...content.matchAll(/import\s*\(\s*['"](@[^'"]+)['"]\s*\)/g),
      ...content.matchAll(/^import\s+['"](@[^'"]+)['"]\s*;/gm),
    ];
    for (const m of aliasImports) {
      let resolved = resolveAlias(m[1], tf);
      if (!resolved) continue;
      resolved = resolveFile(resolved);
      exercised.add(resolved);
      if (!importMap[resolved]) importMap[resolved] = [];
      importMap[resolved].push(tf);
    }
  } catch(e) {}
}

// === AUDIT RESULTS ===
console.log('═══════════════════════════════════════════');
console.log('          DEEP COVERAGE AUDIT');
console.log('═══════════════════════════════════════════\n');

// 1. Ghost imports
for (const f of exercised) {
  if (!fs.existsSync(f)) {
    ghosts.push(f);
  }
}
console.log(`1. GHOST IMPORTS (resolved but file missing): ${ghosts.length}`);
ghosts.forEach(f => console.log(`   ✗ ${f} (from: ${importMap[f]?.join(', ')})`));

// 2. Uncovered by area
let totalUncovered = 0;
console.log('\n2. UNCOVERED FILES BY AREA:');
for (const [area, files] of Object.entries(areas)) {
  const unc = files.filter(f => !exercised.has(f));
  totalUncovered += unc.length;
  console.log(`   ${area.toUpperCase()}: ${files.length - unc.length}/${files.length} (${unc.length} uncovered)`);
  unc.forEach(f => console.log(`     ✗ ${f}`));
}

// 3. Prod files covered by multiple tests
console.log('\n3. COVERAGE DEPTH (files covered by 2+ tests):');
let multiCovered = 0;
for (const [file, tests] of Object.entries(importMap)) {
  if (tests.length >= 2) multiCovered++;
}
console.log(`   ${multiCovered} files covered by 2+ test files`);

// 4. Summary
const totalProd = Object.values(areas).reduce((s, a) => s + a.length, 0);
const totalExercised = totalProd - totalUncovered;
console.log(`\n4. SUMMARY:`);
console.log(`   Total prod files: ${totalProd}`);
console.log(`   Total exercised: ${totalExercised}`);
console.log(`   Coverage: ${((totalExercised/totalProd)*100).toFixed(1)}%`);
console.log(`   Test files: ${testFiles.length}`);
console.log(`   Ghost imports: ${ghosts.length}`);
console.log(`   Uncovered: ${totalUncovered}`);

// 5. Test file counts by area
console.log('\n5. TEST FILE DISTRIBUTION:');
const funcTests = testFiles.filter(f => f.startsWith('functions/'));
const adminTests = testFiles.filter(f => f.startsWith('admin/'));
const kioskTests = testFiles.filter(f => f.startsWith('src/'));
const sharedTests = testFiles.filter(f => f.startsWith('shared/'));
console.log(`   Functions: ${funcTests.length} test files`);
console.log(`   Admin: ${adminTests.length} test files`);
console.log(`   Kiosk+Shared: ${kioskTests.length + sharedTests.length} test files`);

console.log('\n═══════════════════════════════════════════');
