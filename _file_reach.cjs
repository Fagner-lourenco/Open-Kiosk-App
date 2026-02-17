/**
 * file_reach_prod_real — Sprint 0 metric tool
 * Maps all production .ts/.tsx files and cross-references with test imports.
 * Usage: node _file_reach.cjs
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules','dist','build','.git','coverage','.firebase',
  '.vite','.turbo','.next','.cache','firmware','android','patches','public'
]);

function walkProd(dir, base) {
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = path.join(base, e.name).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (rel.includes('__tests__') || rel.includes('__mocks__')) continue;
        results = results.concat(walkProd(path.join(dir, e.name), rel));
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
        results.push(rel);
      }
    }
  } catch(e) {}
  return results;
}

function walkTests(dir, base) {
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = path.join(base, e.name).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        results = results.concat(walkTests(path.join(dir, e.name), rel));
      } else if (/\.(test|spec)\.(ts|tsx)$/.test(e.name)) {
        results.push(rel);
      }
    }
  } catch(e) {}
  return results;
}

// Collect prod files by area
const areas = {
  functions: walkProd('functions/src', 'functions/src'),
  admin: walkProd('admin/src', 'admin/src'),
  kiosk: walkProd('src', 'src'),
  shared: walkProd('shared', 'shared'),
  adminShared: walkProd('admin/shared', 'admin/shared'),
};

// Collect all test files
const testFiles = [
  ...walkTests('functions/src/__tests__', 'functions/src/__tests__'),
  ...walkTests('admin/src/__tests__', 'admin/src/__tests__'),
  ...walkTests('admin/shared/utils/__tests__', 'admin/shared/utils/__tests__'),
  ...walkTests('shared/__tests__', 'shared/__tests__'),
  ...walkTests('src/__tests__', 'src/__tests__'),
];

// Parse imports from test files to determine exercised prod files
const exercised = new Set();

// Alias resolution: @/ -> admin/src/ or src/ depending on test location, @shared/ -> admin/shared/
function resolveAlias(imp, testFilePath) {
  if (imp.startsWith('@shared/')) {
    return path.normalize(path.join('admin/shared', imp.slice(8))).replace(/\\/g, '/');
  }
  if (imp.startsWith('@/')) {
    // If test is in admin/, resolve to admin/src/; otherwise resolve to src/
    const normTf = testFilePath.replace(/\\/g, '/');
    if (normTf.startsWith('admin/')) {
      return path.normalize(path.join('admin/src', imp.slice(2))).replace(/\\/g, '/');
    }
    return path.normalize(path.join('src', imp.slice(2))).replace(/\\/g, '/');
  }
  return null;
}

for (const tf of testFiles) {
  try {
    const content = fs.readFileSync(tf, 'utf8');
    // Match relative imports (static, dynamic, and side-effect)
    const imports = [
      ...content.matchAll(/from\s+['"](\.\.[^'"]+)['"]/g),
      ...content.matchAll(/import\s*\(\s*['"](\.\.[^'"]+)['"]\s*\)/g),
      ...content.matchAll(/^import\s+['"](\.\.[^'"]+)['"]\s*;/gm),
    ];
    for (const m of imports) {
      const imp = m[1];
      const testDir = path.dirname(tf);
      let resolved = path.normalize(path.join(testDir, imp)).replace(/\\/g, '/');
      
      if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
        if (fs.existsSync(resolved + '.ts')) resolved += '.ts';
        else if (fs.existsSync(resolved + '.tsx')) resolved += '.tsx';
        else if (fs.existsSync(resolved + '/index.ts')) resolved += '/index.ts';
        else if (fs.existsSync(resolved + '/index.tsx')) resolved += '/index.tsx';
      }
      exercised.add(resolved);
    }
    
    // Match alias imports (@/ and @shared/)
    const aliasImports = [
      ...content.matchAll(/from\s+['"](@[^'"]+)['"]/g),
      ...content.matchAll(/import\s*\(\s*['"](@[^'"]+)['"]\s*\)/g),
      ...content.matchAll(/^import\s+['"](@[^'"]+)['"]\s*;/gm),
    ];
    for (const m of aliasImports) {
      const alias = m[1];
      let resolved = resolveAlias(alias, tf);
      if (!resolved) continue;
      if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
        if (fs.existsSync(resolved + '.ts')) resolved += '.ts';
        else if (fs.existsSync(resolved + '.tsx')) resolved += '.tsx';
        else if (fs.existsSync(resolved + '/index.ts')) resolved += '/index.ts';
        else if (fs.existsSync(resolved + '/index.tsx')) resolved += '/index.tsx';
      }
      exercised.add(resolved);
    }
    
    // Also check fs.readFileSync references (static analysis tests)
    const fsReads = [...content.matchAll(/readFileSync\s*\(\s*(?:path\.resolve\s*\(\s*(?:process\.cwd\(\)|__dirname)\s*,\s*)?['"]([^'"]+)['"]/g)];
    for (const m of fsReads) {
      let p = m[1];
      // Resolve relative to test file or cwd
      if (p.startsWith('src/') || p.startsWith('../')) {
        const testDir = path.dirname(tf);
        let resolved = path.normalize(path.join(testDir, p)).replace(/\\/g, '/');
        if (fs.existsSync(resolved)) exercised.add(resolved);
      }
    }
  } catch(e) {}
}

// Output report
let totalProd = 0;
let totalExercised = 0;
const allProd = [];

console.log('╔══════════════════════════════════════════════════╗');
console.log('║     FILE REACH PROD REAL — BASELINE REPORT      ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

for (const [area, files] of Object.entries(areas)) {
  const covered = files.filter(f => exercised.has(f));
  const uncovered = files.filter(f => !exercised.has(f));
  const pct = files.length > 0 ? ((covered.length / files.length) * 100).toFixed(1) : '0.0';
  
  console.log(`── ${area.toUpperCase()} ──`);
  console.log(`  Total: ${files.length}  |  Covered: ${covered.length}  |  Uncovered: ${uncovered.length}  |  Reach: ${pct}%`);
  
  if (uncovered.length > 0) {
    console.log('  Missing:');
    uncovered.forEach(f => console.log('    ✗ ' + f));
  }
  console.log('');
  
  totalProd += files.length;
  totalExercised += covered.length;
  allProd.push(...files.map(f => ({ file: f, area, covered: exercised.has(f) })));
}

const totalPct = totalProd > 0 ? ((totalExercised / totalProd) * 100).toFixed(1) : '0.0';
console.log('═══════════════════════════════════════');
console.log(`TOTAL: ${totalExercised}/${totalProd} files (${totalPct}%)`);
console.log(`GAP TO 98%: +${Math.max(0, Math.ceil(totalProd * 0.98) - totalExercised)} files`);
console.log('═══════════════════════════════════════');

// Write JSON for machine consumption
const report = {
  timestamp: new Date().toISOString(),
  total: totalProd,
  exercised: totalExercised,
  pct: parseFloat(totalPct),
  gap98: Math.max(0, Math.ceil(totalProd * 0.98) - totalExercised),
  areas: {},
  uncovered: [],
};

for (const [area, files] of Object.entries(areas)) {
  const covered = files.filter(f => exercised.has(f));
  report.areas[area] = {
    total: files.length,
    exercised: covered.length,
    pct: files.length > 0 ? parseFloat(((covered.length / files.length) * 100).toFixed(1)) : 0,
  };
}

report.uncovered = allProd.filter(f => !f.covered).map(f => f.file);

fs.writeFileSync('coverage.json', JSON.stringify(report, null, 2));
console.log('\nReport saved to coverage.json');
