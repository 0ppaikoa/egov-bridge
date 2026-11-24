// SignAndSend の e2e（オフライン）テスト。
// 本物のサーバの代わりに fetch をスタブし、
// pre-send → start-sign → poll → 本送信 の順序と、署名済み kousei.xml を検証する。
import test from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';

// テスト用ウィンドウ（認証URLを開く部分だけをスタブ）
globalThis.window = { open: () => ({ closed: false }) };
globalThis.document = { getElementsByName: () => [{ value: 'test-csrf-token' }] };

const { cmdSignAndSend } = await import('../src/bridge/commands-core.ts');
const { vfs } = await import('../src/bridge/vfs.ts');
const { verifySignatureXml } = await import('../src/bridge/signature.ts');

const KOUSEI = `<?xml version="1.0" encoding="UTF-8"?>
<DataRoot>
  <構成情報 Id="構成情報">
    <管理情報><手続番号><手続ID>31751</手続ID></手続番号></管理情報>
    <申請書属性情報>
      <申請書様式ID>000000000000000001</申請書様式ID>
      <申請書ファイル名称>form-01.xml</申請書ファイル名称>
    </申請書属性情報>
  </構成情報>
</DataRoot>`;

test('SignAndSend: pre-send → 署名 → 本送信 が順序通りに実行され、署名付きXMLが保存される', async () => {
  vfs.clear();
  vfs.writeFile('/work/test-id/20251/kousei.xml', KOUSEI);
  vfs.writeFile('/work/test-id/20251/form-01.xml', '<Form>dummy</Form>');

  // テスト用の鍵・証明書
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const attrs = [{ name: 'commonName', value: 'test-ca' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const certB64 = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());

  const calls = [];
  let signedDataB64 = null;

  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    calls.push({ method, url: u, headers: opts.headers ?? {} });

    if (u.endsWith('/application-form-entry/AppDataReceive')) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { AppDataReceiveFlag: '1' },
      });
    }
    if (u.includes('/digital-auth/start-sign')) {
      const body = String(opts.body);
      const params = new URLSearchParams(body);
      signedDataB64 = params.get('data');
      assert.ok(signedDataB64, 'start-sign に data が含まれていること');
      return new Response(
        JSON.stringify({
          sign_transaction_id: 'tx-123',
          authorization_url: 'https://idp.example.test/auth',
          wait_time_ms: '1',
          poll_interval_ms: '1',
          max_retries: '5',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (u.includes('/digital-auth/poll')) {
      assert.ok(signedDataB64, 'poll の前に start-sign が呼ばれていること');
      // サーバ役: 受け取った SignedInfo (C14N済み) に署名して返す
      const md = forge.md.sha256.create();
      md.update(forge.util.decode64(signedDataB64));
      const signatureB64 = forge.util.encode64(keys.privateKey.sign(md));
      return new Response(JSON.stringify({ Signature: signatureB64, Certificate: certB64 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('unexpected fetch: ' + u);
  };

  const result = await cmdSignAndSend(['test-id', '20251', 'kousei.xml', '1', 'false', 'false', '20261124120000']);
  assert.equal(result, 0);

  // fetch の呼び出し順序を検証
  const kinds = calls.map((c) => {
    if (c.url.includes('AppDataReceive')) return `AppDataReceive:preSendFlag=${c.headers['preSendFlag']}`;
    if (c.url.includes('start-sign')) return 'start-sign';
    if (c.url.includes('poll')) return 'poll';
    return 'other';
  });
  assert.deepEqual(kinds, ['AppDataReceive:preSendFlag=1', 'start-sign', 'poll', 'AppDataReceive:preSendFlag=0']);

  // 署名済みXMLが保存され、検証に通ること
  const signedXml = vfs.readText('/work/test-id/20251/kousei.xml');
  assert.match(signedXml, /<Signature/);
  assert.match(signedXml, /<署名情報>/);
  const files = new Map([['form-01.xml', new TextEncoder().encode('<Form>dummy</Form>')]]);
  const verify = await verifySignatureXml(signedXml, files);
  assert.equal(verify.ok, true, JSON.stringify(verify.checks, null, 2));
});
