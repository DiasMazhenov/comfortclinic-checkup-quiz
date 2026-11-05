#!/usr/bin/env node
// Build a self-contained T123 artifact from the canonical checkup registry.
// Usage: node scripts/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const htmlPath = resolve(root, 'tilda/comfortclinic_quiz_T123.html');
const registryPath = resolve(root, 'data/checkups.json');
const html = readFileSync(htmlPath, 'utf8');
const records = JSON.parse(readFileSync(registryPath, 'utf8'));

if (!Array.isArray(records) || records.length === 0) {
  throw new Error('data/checkups.json must contain a nonempty array');
}
const pattern = /const programs=(\[[\s\S]*?\]);\s*const q=/;
if (!pattern.test(html)) {
  throw new Error('Cannot locate embedded programs array; inspect the T123 HTML before replacing data');
}
const replacement = 'const programs=' + JSON.stringify(records) + ';\nconst q=';
const next = html.replace(pattern, replacement);
if (next !== html) {
  writeFileSync(htmlPath, next, 'utf8');
  console.log('Updated embedded checkup data in ' + htmlPath);
} else {
  console.log('T123 HTML already matches data/checkups.json');
}
