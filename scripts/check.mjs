// dist/ の内容物を検証する（vite build 後に実行すること）。
// - manifest.json が MV3 で必須フィールドを持つこと
// - content_scripts が world: MAIN / document_start であり、参照ファイルが dist に存在すること
// - DNR ルールセットが存在しパースできること
// - zip アーカイブ作成に必要なファイルが揃っていること
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const failures = [];
const ok = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures.push(name);
};

if (!existsSync(path.join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json がありません。先に npm run build を実行してください。');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
ok('manifest_version is 3', manifest.manifest_version === 3);
ok('version present', typeof manifest.version === 'string' && manifest.version.length > 0);
ok('minimum_chrome_version >= 111', Number(manifest.minimum_chrome_version ?? '111') >= 111);

const cs = (manifest.content_scripts ?? [])[0];
ok('content script declared', !!cs);
if (cs) {
  ok('main world', cs.world === 'MAIN');
  ok('document_start', cs.run_at === 'document_start');
  for (const js of cs.js ?? []) {
    ok(`content script bundled: ${js}`, existsSync(path.join(dist, js)));
  }
}

ok(
  'popup exists',
  !!manifest.action?.default_popup && existsSync(path.join(dist, manifest.action.default_popup)),
);

for (const res of manifest.declarative_net_request?.rule_resources ?? []) {
  const rulePath = path.join(dist, res.path);
  ok(`dnr ruleset exists: ${res.path}`, existsSync(rulePath));
  if (!existsSync(rulePath)) continue;
  const rules = JSON.parse(readFileSync(rulePath, 'utf8'));
  const ids = new Set(rules.map((r) => r?.id));
  ok(
    'dnr rule ids unique',
    ids.size === rules.length && [...ids].every((id) => Number.isInteger(id) && id > 0),
  );
  for (const r of rules) {
    ok(`dnr rule has action/condition: id=${r?.id}`, !!r?.action?.type && !!r?.condition);
  }
}

const shim = manifest.content_scripts?.[0]?.js?.[0];
if (shim && existsSync(path.join(dist, shim))) {
  const body = readFileSync(path.join(dist, shim), 'utf8');
  ok('shim does not reference chrome.runtime (MAIN world)', !body.includes('chrome.runtime'));
}

if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S)`);
  process.exit(1);
}
console.log('\ncheck OK');
