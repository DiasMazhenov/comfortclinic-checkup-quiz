#!/usr/bin/env node
// Static checks; they do NOT replace a browser/Tilda runtime test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'tilda/comfortclinic_quiz_T123.html'), 'utf8');
const data = JSON.parse(readFileSync(resolve(root, 'data/checkups.json'), 'utf8'));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

check(data.length === 16, 'Registry must contain 16 programs');
check(new Set(data.map(x => x.id)).size === data.length, 'Record IDs must be unique');
check(data.every(x => Number.isInteger(x.id) && x.id > 0), 'Every program needs a valid Tilda Record ID');
check(data.every(x => [1,2,3,4].includes(x.tab)), 'Invalid Tilda tab index');
check(data.every(x => ['any','female','male'].includes(x.gender)), 'Invalid gender');
check(data.every(x => Number.isInteger(x.ageMin) && Number.isInteger(x.ageMax) && x.ageMin >= 0 && x.ageMax <= 100 && x.ageMin <= x.ageMax), 'Invalid age ranges');
check(data.every(x => x.price > 0 && x.oldPrice >= x.price && x.saving === x.oldPrice - x.price), 'Price/saving arithmetic mismatch');
check(data.every(x => x.title && Array.isArray(x.services) && x.services.length > 0), 'Missing titles or service summaries');
check(data.every(x => (x.tab === 1 && x.gender === 'female') || (x.tab === 2 && x.gender === 'male') || x.tab === 3 || x.tab === 4), 'Sex/tab mismatch');
const embeddedMatch = html.match(/const programs=(\[[\s\S]*?\]);\s*const q=/);
check(!!embeddedMatch, 'Embedded programs array not found');
if (embeddedMatch) {
  try { assert.deepEqual(JSON.parse(embeddedMatch[1]), data); }
  catch { errors.push('HTML embedded programs differ from data/checkups.json (run node scripts/build.mjs)'); }
}
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
check(!!scriptMatch, 'Inline script missing');
if (scriptMatch) {
  try { new Script(scriptMatch[1]); }
  catch (e) { errors.push('Invalid JavaScript syntax: ' + e.message); }
}
check((html.match(/class="ccq-panel"/g) || []).length === 5, 'Expected five wizard panels');
check(html.includes('id="ccq-browse"') && html.includes('Выбрать чекап самостоятельно'), 'Independent browse link missing');
check(html.includes('href="#rec5299319803"'), 'Native Tilda tabs anchor missing');
check(html.includes("if(exact.length)return {items:exact,fallback:false}"), 'Explicit fallback decision missing');
check(html.includes("return {items:generalPrograms(),fallback:true}"), 'General fallback missing');
check(html.includes("const hash='!/tab/5299319803-'"), 'Native tab hash integration missing');
check(html.includes("book.href='#zapis'"), 'Tilda booking popup link missing');
check(!/демо|согласовани|на согласовании/iu.test(html), 'Disallowed public copy remains in T123 HTML');
check(!/<script[^>]+src=|<link[^>]+href=/i.test(html), 'Unexpected external dependency');
check(!/(sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/.test(html), 'Suspicious credential-like value');

// Reproduce selection invariants for targeted regression scenarios;
// this tests the intended registry rules, not browser events.
const eligible = (age, sex) => data.filter(p => age >= p.ageMin && age <= p.ageMax && (p.gender === 'any' || p.gender === sex));
function general(age, sex) {
  const rows = eligible(age, sex).filter(p => p.topic === 'general');
  const order = age < 18
    ? age >= 13 ? [5336874303,5336874803,5336874503]
      : age >= 6 ? [5336874503,5336874403,5336874303]
        : [5336874503,5336874603,5336874703]
    : [5336877903,5336872503,5336877703];
  return rows.sort((a,b) => {
    const i = order.indexOf(a.id), j = order.indexOf(b.id);
    return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
  }).slice(0,3);
}
function expectedCandidates(age, sex, topic) {
  if (topic === 'general') return {items:general(age,sex),fallback:false};
  const exact = topic === 'gut' ? [] : eligible(age,sex).filter(p => p.topic === topic).slice(0,3);
  return exact.length ? {items:exact,fallback:false} : {items:general(age,sex),fallback:true};
}
const scenarios = [
  {age:28,sex:'female',topic:'gynecology',count:3,fallback:false},
  {age:42,sex:'male',topic:'urology',count:2,fallback:false},
  {age:35,sex:'female',topic:'gut',count:3,fallback:true},
  {age:8,sex:'female',topic:'general',count:3,fallback:false},
  {age:8,sex:'male',topic:'thyroid',count:3,fallback:true},
  {age:2,sex:'male',topic:'weight',count:3,fallback:true},
  {age:11,sex:'female',topic:'weight',count:1,fallback:false},
  {age:18,sex:'female',topic:'general',count:3,fallback:false},
  {age:70,sex:'male',topic:'gynecology',count:3,fallback:true},
  {age:100,sex:'female',topic:'thyroid',count:1,fallback:false}
];
for (const s of scenarios) {
  const r = expectedCandidates(s.age,s.sex,s.topic);
  check(r.items.length === s.count && r.fallback === s.fallback, 'Scenario mismatch: '+JSON.stringify(s));
  check(r.items.every(p=>p.ageMin <= s.age && s.age <= p.ageMax && (p.gender === 'any' || p.gender === s.sex)), 'Ineligible program in '+JSON.stringify(s));
}
if (errors.length) {
  console.error(errors.map((e,i)=> (i+1)+'. '+e).join('\n'));
  process.exit(1);
}
console.log('PASS: 16 records, embedded data, pricing, syntax, wizard, Tilda links, copy and '+scenarios.length+' catalog scenarios.');
