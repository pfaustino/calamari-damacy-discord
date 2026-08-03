import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'css', 'style.css');
const destDir = path.join(root, 'public', 'css');
const dest = path.join(destDir, 'style.css');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
