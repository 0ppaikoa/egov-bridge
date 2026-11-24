// C# の SignedXml と JS 実装の完全一致検証。
//   - SignedInfo の C14N（Base64）
//   - 構成情報のダイジェスト
//   - 申請書ファイル / 添付ファイルのダイジェスト（URI も含む）
//   - 署名値（RSA PKCS#1 v1.5 は決定的なので一致必須）
//   - .NET が JS の署名を検証できること（相互運用）
//
// 使い方: node scripts/parity-sign.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createPrivateKey, sign as cryptoSign, constants } from 'node:crypto';
import { prepareSigning, collectReferences } from '../src/bridge/signature.ts';

const DOTNET_ROOT = '/tmp/aok/egov-recon/dotnet';
const HARNESS = '/tmp/aok/egov-recon/harness';
const WORK = '/tmp/aok/egov-recon/parity';
const env = { ...process.env, DOTNET_ROOT, PATH: `${DOTNET_ROOT}:${process.env.PATH}` };

function dotnet(args) {
  return execFileSync('dotnet', ['run', '--no-build', '--project', HARNESS, '--', ...args], {
    encoding: 'utf8',
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
}

if (!existsSync(`${HARNESS}/bin/Debug/net10.0/harness.dll`)) {
  console.error('C# ハーネス未ビルド。/tmp/aok/egov-recon/harness で dotnet build してください。');
  process.exit(2);
}
try {
  readFileSync(`${WORK}/key.key.pem`);
} catch {
  dotnet(['makekey', `${WORK}/key`]);
}
const privateKey = createPrivateKey(readFileSync(`${WORK}/key.key.pem`, 'utf8'));

const checks = [];
function cmp(name, jsVal, csVal) {
  const ok = String(jsVal) === String(csVal);
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    console.log('  JS: ' + String(jsVal).slice(0, 200));
    console.log('  C#: ' + String(csVal).slice(0, 200));
  }
}

function parseCs(out) {
  const map = {};
  const extras = [];
  for (const line of out.trim().split('\n')) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i);
    const v = line.slice(i + 1);
    if (k.startsWith('DIGEST_') && /^DIGEST_\d+$/.test(k)) extras.push(v);
    else map[k] = v;
  }
  map.extras = extras;
  return map;
}

/**
 * 1ケースを比較する。
 * @param label ケース名
 * @param xmlPath kousei.xml のパス
 * @param files 申請書/添付（Map<name, bytes>）
 * @param extraSpec C# に渡す追加参照（"uri|path,..."）または null
 */
async function runCase(label, xmlPath, files, extraSpec) {
  const kouseiXml = readFileSync(xmlPath, 'utf8');
  const args = ['signxml', xmlPath, `${WORK}/key.key.pem`, `${WORK}/key.cert.pem`];
  if (extraSpec) args.push(extraSpec);
  const cs = parseCs(dotnet(args));

  const prep = await prepareSigning(kouseiXml, files, cs.SIGNATURE_ID);
  const refs = await collectReferences(kouseiXml, files);

  cmp(`${label}: SignedInfo C14N`, prep.base64CanonicalData, cs.SIGNEDINFO_C14N_B64);
  cmp(`${label}: 構成情報ダイジェスト`, refs[0].digestValue, cs.DIGEST_KOUSEI);

  // 追加参照（申請書・添付）の URI とダイジェスト
  for (let i = 1; i < refs.length; i++) {
    const [csUri, csDigest] = (cs.extras[i - 1] ?? '').split('|');
    cmp(`${label}: 参照${i} URI`, refs[i].uri, csUri);
    cmp(`${label}: 参照${i} ダイジェスト`, refs[i].digestValue, csDigest);
  }

  const jsSig = cryptoSign('sha256', Buffer.from(prep.base64CanonicalData, 'base64'), {
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING,
  }).toString('base64');
  cmp(`${label}: 署名値`, jsSig, cs.SIGNATURE);

  writeFileSync(
    '/tmp/aok/parity-verify.js.tmp',
    JSON.stringify({ jsSig, signedInfo: prep.base64CanonicalData }),
  );
  cmp(
    `${label}: .NET が JS 署名を検証`,
    dotnet(['verifysig', `${WORK}/key.cert.pem`, '/tmp/aok/parity-verify.js.tmp']).trim(),
    'OK',
  );
}

// ケース1: 構成情報のみ
await runCase('構成情報のみ', `${WORK}/kousei/kousei.xml`, new Map(), null);

// ケース2: 申請書 + 添付
{
  const dir = `${WORK}/kousei2`;
  const files = new Map([
    ['form-01.xml', new Uint8Array(readFileSync(`${dir}/form-01.xml`))],
    ['attachment-1.pdf', new Uint8Array(readFileSync(`${dir}/attachment-1.pdf`))],
  ]);
  const spec = `form-01.xml|${dir}/form-01.xml,attachment-1.pdf|${dir}/attachment-1.pdf`;
  await runCase('申請書+添付', `${dir}/kousei.xml`, files, spec);
}

console.log('');
const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`${failed.length}/${checks.length} FAILED`);
  process.exit(1);
}
console.log(`すべて一致 (${checks.length} checks)`);
