// X.509 証明書から SPKI を取り出す DER 走査の単体テスト。
// 証明書は C# ハーネスが生成したもの（/tmp/aok/egov-recon/parity/key.cert.pem）を再利用する。
// 生成物が無い環境ではスキップする。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createPublicKey, createPrivateKey, sign, constants } from 'node:crypto';
import {
  extractSpkiFromCertificate,
  importRsaPublicKeyFromCertificate,
} from '../src/bridge/der.ts';
import { base64ToBytes, bytesToBase64 } from '../src/bridge/bytes.ts';

const CERT_PEM = '/tmp/aok/egov-recon/parity/key.cert.pem';
const KEY_PEM = '/tmp/aok/egov-recon/parity/key.key.pem';
const available = existsSync(CERT_PEM) && existsSync(KEY_PEM);

const pemToDer = (pem) => base64ToBytes(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));

test('SPKI 抽出結果が Node の createPublicKey と一致する', { skip: !available }, () => {
  const der = pemToDer(readFileSync(CERT_PEM, 'utf8'));
  const spki = extractSpkiFromCertificate(der);
  const expected = createPublicKey(readFileSync(CERT_PEM)).export({ type: 'spki', format: 'der' });
  assert.equal(bytesToBase64(spki), Buffer.from(expected).toString('base64'));
});

test('WebCrypto に読み込んだ鍵が Node の署名を検証できる', { skip: !available }, async () => {
  const der = pemToDer(readFileSync(CERT_PEM, 'utf8'));
  const key = await importRsaPublicKeyFromCertificate(der);

  const payload = new TextEncoder().encode('パリティ検証用のデータ');
  const signature = sign('sha256', payload, {
    key: createPrivateKey(readFileSync(KEY_PEM, 'utf8')),
    padding: constants.RSA_PKCS1_PADDING,
  });

  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, payload);
  assert.equal(ok, true);
});
