#!/usr/bin/env node
// Static regression tests for the clinic's selection matrix (not a browser E2E test).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'tilda/comfortclinic_quiz_T123.html'), 'utf8');
const programs = JSON.parse(readFileSync(resolve(root, 'data/checkups.json'), 'utf8'));
const rules = JSON.parse(readFileSync(resolve(root, 'data/recommendation-rules.json'), 'utf8'));
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };

check(programs.length === 16, 'Expected 16 current catalog programs');
check(new Set(programs.map(p => p.id)).size === programs.length, 'Duplicate Tilda Record IDs');
check(programs.every(p => Number.isInteger(p.id) && p.id > 0), 'Invalid Record ID');
check(programs.every(p => [1,2,3,4].includes(p.tab)), 'Invalid Tilda tab');
check(programs.every(p => ['female','male','any'].includes(p.gender)), 'Invalid gender');
check(programs.every(p => Number.isInteger(p.ageMin) && Number.isInteger(p.ageMax) && p.ageMin >= 0 && p.ageMin <= p.ageMax && p.ageMax <= 100), 'Invalid age bounds');
check(programs.every(p => p.price > 0 && p.oldPrice >= p.price && p.saving === p.oldPrice - p.price), 'Invalid price/saving arithmetic');
check(programs.every(p => p.title && Array.isArray(p.services) && p.services.length), 'Missing catalog information');
check(Object.keys(rules.codes).length === 16, 'Expected 16 clinic code mappings');
check(new Set(Object.values(rules.codes)).size === 16, 'Code mapping is not one-to-one');
check(Object.values(rules.codes).every(id => programs.some(p => p.id === id)), 'Clinic code references nonexistent Tilda Record ID');

const programMatch = html.match(/const programs=(\[[\s\S]*?\]);\s*const recommendationRules=/);
const ruleMatch = html.match(/const recommendationRules=(\{[\s\S]*?\});\s*const q=/);
check(!!programMatch, 'Embedded programs not found');
check(!!ruleMatch, 'Embedded recommendationRules not found');
if (programMatch) {
  try { assert.deepEqual(JSON.parse(programMatch[1]), programs); }
  catch { errors.push('Embedded programs differ from data/checkups.json; run npm run build'); }
}
if (ruleMatch) {
  try { assert.deepEqual(JSON.parse(ruleMatch[1]), {codes:rules.codes,branches:rules.branches}); }
  catch { errors.push('Embedded rules differ from data/recommendation-rules.json; run npm run build'); }
}
const script = html.match(/<script>([\s\S]*?)<\/script>/);
check(!!script, 'Inline JavaScript missing');
if (script) {
  try { new Script(script[1]); }
  catch (error) { errors.push('Invalid inline JavaScript: ' + error.message); }
}

check((html.match(/class="ccq-panel"/g) || []).length === 4, 'Expected four screens: sex, age, topic, results');
check(html.includes('function currentBranch()') && html.includes('recommendationRules.codes'), 'Clinic matrix selector missing');
check(html.includes('return {items:recommendedForTopic(\'general\'),fallback:true}'), 'Fallback to general programs missing');
check(html.includes('Собрать свой чекап'), 'Fourth card “Собрать свой” missing');
check(html.includes('id="ccq-browse"') && html.includes('href="#rec5299319803"'), 'Direct browsing of native Tilda tabs missing');
check(html.includes("const hash='!/tab/5299319803-'"), 'Native tab navigation missing');
check(html.includes("book.href='#zapis'"), 'Booking popup link missing');
check(!/демо|согласовани|на согласовании/iu.test(html), 'Disallowed end-user copy in HTML');
check(!/<script[^>]+src=|<link[^>]+href=/i.test(html), 'Unexpected external dependency');
check(!/(sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/.test(html), 'Possible secret in bundle');

const eligible = (age,sex) => programs.filter(p =>
  age >= p.ageMin && age <= p.ageMax && (p.gender === 'any' || p.gender === sex));
function getResults(age,sex,topic) {
  const band = age < 18 ? 'child' : age < 35 ? 'adult18_34' : 'adult35plus';
  const branch = rules.branches[age < 18 ? 'child' : sex]?.[band] || {};
  const byId = new Map(eligible(age,sex).map(p => [p.id,p]));
  const select = key => (branch[key] || []).map(code => byId.get(rules.codes[code])).filter(Boolean).slice(0,3);
  const direct = select(topic);
  return direct.length ? {items:direct,fallback:false} : {items:select('general'),fallback:true};
}
const codes = list => list.map(code => rules.codes[code]);
const scenarios = [
  [28,'female','gynecology',['A','B','C'],false],
  [28,'female','thyroid',['G','F','B'],false],
  [28,'female','weight',['G','F'],false],
  [28,'female','general',['G','F','B'],false],
  [35,'female','gynecology',['A','B','C'],false],
  [35,'female','thyroid',['G','F','B'],false],
  [35,'female','weight',['F','I','H'],false],
  [35,'female','general',['F','B','C'],false],
  [28,'male','urology',['D','E'],false],
  [28,'male','thyroid',['G','F','D'],false],
  [28,'male','weight',['G','F'],false],
  [28,'male','general',['F','D','E'],false],
  [35,'male','urology',['D','E'],false],
  [35,'male','thyroid',['G','F','D'],false],
  [35,'male','weight',['F','I','H'],false],
  [35,'male','general',['F','I','D'],false],
  [15,'male','children',['K1','K4','K5'],false],
  [15,'female','thyroid',['K6','K3','K7'],false],
  [12,'female','weight',['K1','K3','K7'],false],
  [12,'male','general',['K1','K3','K4'],false],
  [35,'female','gut',['F','B','C'],true],
  [35,'male','gut',['F','I','D'],true],
  [5,'female','thyroid',['K1','K4'],true],
  [8,'male','weight',['K1'],false],
  [0,'male','general',['K1','K4'],false],
  [18,'female','general',['G','F','B'],false],
  [34,'male','general',['F','D','E'],false],
  [100,'female','general',['F','B','C'],false]
];
for (const [age,sex,topic,expected,fallback] of scenarios) {
  const result = getResults(age,sex,topic);
  check(JSON.stringify(result.items.map(p => p.id)) === JSON.stringify(codes(expected)),
    'Wrong selection for ' + JSON.stringify({age,sex,topic,expected}));
  check(result.fallback === fallback, 'Wrong fallback for '+JSON.stringify({age,sex,topic}));
  check(result.items.every(p => p.ageMin <= age && p.ageMax >= age && (p.gender === 'any' || p.gender === sex)),
    'Age or gender mismatch in '+JSON.stringify({age,sex,topic}));
}
if (errors.length) {
  console.error(errors.map((e,i) => (i+1)+'. '+e).join('\n'));
  process.exit(1);
}
console.log('PASS: 16 programs, clinic matrix, four-screen quiz, JavaScript and '+scenarios.length+' selection cases.');
