// C# 実装（.NET の XmlDsigC14NTransform / WebUtility.UrlEncode / SHA256）と
// JavaScript 実装の出力が一致することを検証する。
//
// 使い方: node scripts/parity-csharp.mjs
// 前提: /tmp/aok/egov-recon/harness に C# ハーネスがビルド済みであること。
//       無い場合は SKIP として扱い、成功扱いにしない（黙って通さない）。
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DOMParser } from '@xmldom/xmldom';
import { c14n } from '../src/c14n.ts';
import { webUtilityUrlEncode, sha256Base64 } from '../src/bridge/bytes.ts';

const DOTNET_ROOT = '/tmp/aok/egov-recon/dotnet';
const HARNESS = '/tmp/aok/egov-recon/harness';
const env = { ...process.env, DOTNET_ROOT, PATH: `${DOTNET_ROOT}:${process.env.PATH}` };

function runHarness(args, input) {
  return execFileSync('dotnet', ['run', '--no-build', '--project', HARNESS, '--', ...args], {
    encoding: 'buffer',
    env,
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

if (!existsSync(`${HARNESS}/bin/Debug/net10.0/harness.dll`)) {
  console.error(
    'C# ハーネスが見つかりません。先に /tmp/aok/egov-recon/harness で dotnet build してください。',
  );
  process.exit(2);
}

const failures = [];
let checks = 0;

function check(name, jsVal, csBuf) {
  checks++;
  const csStr = Buffer.from(csBuf).toString('utf8');
  const ok = String(jsVal) === csStr;
  if (!ok) {
    failures.push(name);
    console.log(`FAIL  ${name}`);
    console.log('  JS: ' + JSON.stringify(String(jsVal)).slice(0, 400));
    console.log('  C#: ' + JSON.stringify(csStr).slice(0, 400));
  } else {
    console.log(`PASS  ${name}`);
  }
}

// --- 1. C14N: フィクスチャ比較 ---
const fixtures = [
  '/data/profiles/aok/cache/scratch/c14n-fixtures/1.xml',
  '/data/profiles/aok/cache/scratch/c14n-fixtures/2.xml',
  '/data/profiles/aok/cache/scratch/c14n-fixtures/3.xml',
  '/data/profiles/aok/cache/scratch/c14n-fixtures/4.xml',
  '/data/profiles/aok/cache/scratch/c14n-fixtures/5.xml',
];

for (const f of fixtures) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, 'utf8');
  const doc = new DOMParser().parseFromString(src, 'application/xml');
  const jsOut = c14n(doc);
  const csOut = runHarness(['c14n', f]);
  check(`c14n ${f.split('/').pop()}`, jsOut, csOut);
}

// --- 2. C14N 部分木（SignedInfo 相当）---
{
  const xml =
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference URI="#%E6%A7%8B%E6%88%90%E6%83%85%E5%A0%B1"><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=</DigestValue></Reference></SignedInfo></Signature>';
  const tmp = '/tmp/aok/parity-signedinfo.xml';
  execFileSync('bash', ['-c', `cat > ${tmp} <<'XMLEOF'\n${xml}\nXMLEOF`]);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const si = doc.documentElement.firstChild;
  const jsOut = c14n(si);
  const csOut = runHarness(['c14n-subtree', tmp, 'SignedInfo']);
  check('c14n SignedInfo 部分木', jsOut, csOut);
}

// --- 3. WebUtility.UrlEncode ---
const urlCases = [
  '構成情報',
  'attachment-1.pdf',
  '日本語 ファイル名.pdf',
  'a+b&c=d/e?f#g',
  'ＡＢＣ１２３',
  'quote\'and"double',
  '~-._',
  '100%',
];
for (const s of urlCases) {
  check(`UrlEncode(${JSON.stringify(s)})`, webUtilityUrlEncode(s), runHarness(['urlencode', s]));
}

// --- 4. SHA-256 base64 ---
{
  const content = 'テスト用の内容です。\n改行も含む。\n';
  const tmp = '/tmp/aok/parity-sha256.txt';
  execFileSync('bash', ['-c', `printf '%s' ${JSON.stringify(content)} > ${tmp}`]);
  const bytes = new Uint8Array(readFileSync(tmp));
  const jsOut = await sha256Base64(bytes);
  const csOut = runHarness(['sha256', tmp]);
  check('SHA-256 base64', jsOut, csOut);
}

console.log('');
if (failures.length) {
  console.error(`${failures.length}/${checks} FAILED`);
  process.exit(1);
}
console.log(`すべて一致 (${checks} checks)`);
