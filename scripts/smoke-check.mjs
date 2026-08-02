import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'scripts', 'smoke-check.manifest.json');
const defaults = ['index.html', 'ARCHITECTURE.md'];

let required = defaults;
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (Array.isArray(manifest.required)) required = manifest.required;
}

for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error(`missing: ${rel}`);
    process.exit(1);
  }
}

for (const rel of required) {
  if (rel.endsWith('.json')) {
    JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  }
}

console.log('smoke-check ok');
