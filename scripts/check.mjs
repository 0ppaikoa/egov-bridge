// ローカルとCIの両方から実行する簡易検証。
// - manifest.json の構造チェック
// - content_scripts / background で参照されるファイルの存在チェック
// - src/*.js の構文チェック
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures.push(name);
};

const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
ok('manifest_version is 3', manifest.manifest_version === 3);
ok('name present', typeof manifest.name === 'string' && manifest.name.length > 0);
ok('version present', typeof manifest.version === 'string' && manifest.version.length > 0);

const referenced = [];
if (manifest.background?.service_worker) referenced.push(manifest.background.service_worker);
for (const cs of manifest.content_scripts ?? []) referenced.push(...(cs.js ?? []));
if (manifest.action?.default_popup) referenced.push(manifest.action.default_popup);
for (const rel of referenced) {
  ok(`referenced file exists: ${rel}`, existsSync(path.join(root, rel)));
}

// declarativeNetRequest ルールの静的検証
for (const res of manifest.declarative_net_request?.rule_resources ?? []) {
  const rulePath = path.join(root, res.path);
  ok(`dnr rule file exists: ${res.path}`, existsSync(rulePath));
  if (!existsSync(rulePath)) continue;
  let rules = null;
  try {
    rules = JSON.parse(readFileSync(rulePath, 'utf8'));
  } catch (e) {
    ok(`dnr rules parse as JSON: ${res.path}`, false);
    continue;
  }
  ok(`dnr rules are an array: ${res.path}`, Array.isArray(rules));
  const ids = new Set(rules.map((r) => r?.id));
  ok('dnr rule ids are unique', ids.size === rules.length && [...ids].every((id) => Number.isInteger(id) && id > 0));
  for (const r of rules) {
    ok(`dnr rule has action/condition: id=${r?.id}`, !!r?.action?.type && !!r?.condition);
  }
}

const srcDir = path.join(root, 'src');
for (const f of readdirSync(srcDir).filter((f) => f.endsWith('.js'))) {
  const file = path.join(srcDir, f);
  try {
    new vm.Script(readFileSync(file, 'utf8'), { filename: f });
    console.log(`PASS  syntax ok: src/${f}`);
  } catch (e) {
    failures.push(`syntax: ${f}`);
    console.error(`FAIL  syntax: src/${f}: ${e.message}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S)`);
  process.exit(1);
}
console.log('\ncheck OK');
