// 署名パイプラインの offline 検証。
// kousei.xml を仮想的に構築し、ローカル生成した RSA 鍵でサーバ役の署名を行い、
// assemble → verify が通ることを確認する（ネットワーク不使用）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareSigning,
  assembleSignedXml,
  verifySignatureXml,
  collectReferences,
  buildSignedInfoXml,
} from '../src/bridge/signature.ts';
import { makeTestCertificate, signSha256Base64 } from './helpers/cert.mjs';

const KOUSEI = `<?xml version="1.0" encoding="UTF-8"?>
<DataRoot>
  <構成情報 ID="構成情報">
    <管理情報>
      <手続番号>
        <手続ID>31751</手続ID>
      </手続番号>
    </管理情報>
    <添付書類属性情報>
      <添付種別>添付</添付種別>
      <添付書類ファイル名称>attachment-1.pdf</添付書類ファイル名称>
      <提出情報>1</提出情報>
    </添付書類属性情報>
    <申請書属性情報>
      <申請書様式ID>000000000000000001</申請書様式ID>
      <申請書ファイル名称>form-01.xml</申請書ファイル名称>
    </申請書属性情報>
  </構成情報>
</DataRoot>`;

const FILES = new Map([
  ['form-01.xml', new TextEncoder().encode('<Form>dummy</Form>')],
  ['attachment-1.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4])],
]);

/** サーバ役: SignedInfo の C14N バイト列に署名して署名済み XML を組み立てる */
function signLikeServer(kouseiXml, prep) {
  const { privateKey, certB64 } = makeTestCertificate();
  const sigB64 = signSha256Base64(Buffer.from(prep.base64CanonicalData, 'base64'), privateKey);
  return assembleSignedXml(kouseiXml, prep.refs, prep.signatureId, sigB64, certB64);
}

test('構成情報のダイジェストがC14N経由で計算される', async () => {
  const refs = await collectReferences(KOUSEI, FILES);
  assert.equal(refs.length, 3);
  assert.equal(refs[0].uri, '#%E6%A7%8B%E6%88%90%E6%83%85%E5%A0%B1');
  assert.ok(refs[0].withC14nTransform);
  assert.equal(refs[1].uri, 'form-01.xml');
  assert.equal(refs[2].uri, 'attachment-1.pdf');
});

test('署名 → 埋め込み → 検証が通る', async () => {
  const prep = await prepareSigning(KOUSEI, FILES, '20261124120000');
  assert.ok(prep.base64CanonicalData.length > 0);

  const finalXml = signLikeServer(KOUSEI, prep);
  const result = await verifySignatureXml(finalXml, FILES);

  assert.equal(result.ok, true, JSON.stringify(result.checks, null, 2));
  assert.ok(result.checks.some((c) => c.name === 'signature-value' && c.ok));
});

test('改ざんを検出できる', async () => {
  const prep = await prepareSigning(KOUSEI, FILES, '20261124120001');
  const finalXml = signLikeServer(KOUSEI, prep);

  // 構成情報内の値を書き換える → ダイジェスト不一致で落ちるはず
  const tampered = finalXml.replace('<手続ID>31751</手続ID>', '<手続ID>99999</手続ID>');
  const result = await verifySignatureXml(tampered, FILES);
  assert.equal(result.ok, false);
});

test('buildSignedInfoXml の参照URIが公式仕様（#%エンコード構成情報）になる', async () => {
  const refs = await collectReferences(KOUSEI, FILES);
  const xml = buildSignedInfoXml(refs);
  assert.match(xml, /URI="#%E6%A7%8B%E6%88%90%E6%83%85%E5%A0%B1"/);
  assert.match(
    xml,
    /<CanonicalizationMethod Algorithm="http:\/\/www\.w3\.org\/TR\/2001\/REC-xml-c14n-20010315"\/>/,
  );
  assert.match(
    xml,
    /<SignatureMethod Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmldsig-more#rsa-sha256"\/>/,
  );
});
