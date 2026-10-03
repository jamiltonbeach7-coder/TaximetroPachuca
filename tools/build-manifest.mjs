#!/usr/bin/env node
// Genera integrity.json con el SHA-256 de cada archivo de la app y un hash raíz.
// Uso: node tools/build-manifest.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'index.html', 'app.js', 'style.css', 'manifest.json', 'icon.svg', 'sw.js',
  ...readdirSync(join(root, 'shared')).filter(f => f.endsWith('.js')).map(f => `shared/${f}`),
  ...readdirSync(join(root, 'conductor')).filter(f => /\.(html|js|json)$/.test(f)).map(f => `conductor/${f}`)
];

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const files = {};
for (const f of FILES.sort()) files[f] = sha(readFileSync(join(root, f)));

const rootHash = sha(Object.keys(files).sort().map(p => `${p}:${files[p]}\n`).join(''));
const manifest = { version: 1, generated: new Date().toISOString(), rootHash, files };
writeFileSync(join(root, 'integrity.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`integrity.json generado (${FILES.length} archivos)\nHash raíz: ${rootHash}`);
