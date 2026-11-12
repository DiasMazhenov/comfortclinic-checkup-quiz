#!/usr/bin/env node
// Build a self-contained T123 artifact using the program registry and clinic decision matrix.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const htmlPath = resolve(root, 'tilda/comfortclinic_quiz_T123.html');
const html = readFileSync(htmlPath, 'utf8');
const programs = JSON.parse(readFileSync(resolve(root, 'data/checkups.json'), 'utf8'));
const rules = JSON.parse(readFileSync(resolve(root, 'data/recommendation-rules.json'), 'utf8'));

if (!Array.isArray(programs) || programs.length < 1) {
  throw new Error('data/checkups.json must contain a nonempty array');
}
if (!rules.codes || !rules.branches) {
  throw new Error('data/recommendation-rules.json must contain codes and branches');
}

// Only the fields used by the browser are embedded: metadata stays in the JSON.
const runtimeRules = { codes: rules.codes, branches: rules.branches };
const pattern = /const programs=\[[\s\S]*?\];\s*const recommendationRules=\{[\s\S]*?\};\s*const q=/;
if (!pattern.test(html)) {
  throw new Error('Expected embedded programs and recommendationRules before const q=');
}
const replacement = 'const programs=' + JSON.stringify(programs) + ';\n'
  + 'const recommendationRules=' + JSON.stringify(runtimeRules) + ';\nconst q=';
const updated = html.replace(pattern, replacement);
if (updated !== html) {
  writeFileSync(htmlPath, updated, 'utf8');
  console.log('T123 bundle rebuilt with checkups.json and recommendation-rules.json');
} else {
  console.log('T123 bundle is up to date');
}
