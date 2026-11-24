// テスト専用の証明書生成ヘルパ。
// node-forge を devDependency からも外したため、X.509 を最小限だけ自前で組み立てる。
// 生成するのは「SPKI を取り出して WebCrypto で検証できる」ことだけを満たす DER 証明書で、
// 実運用の証明書ではない（署名検証のテスト用）。
import { generateKeyPairSync, sign, constants, createPublicKey, randomBytes } from 'node:crypto';

// --- DER エンコードの最小ヘルパ ---
function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), derLen(body.length), body]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const oid = (bytes) => tlv(0x06, Buffer.from(bytes));
const int = (bytes) => tlv(0x02, Buffer.from(bytes));
const bitString = (body) => tlv(0x03, Buffer.concat([Buffer.from([0]), body]));
const octetString = (body) => tlv(0x04, body);
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const utcTime = (s) => tlv(0x17, Buffer.from(s, 'ascii'));
const explicit = (n, body) => tlv(0xa0 | n, body);
const nullVal = () => Buffer.from([0x05, 0x00]);

const OID = {
  sha256WithRSA: [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b],
  rsaEncryption: [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01],
  commonName: [0x55, 0x04, 0x03],
};

const name = (cn) => seq(set(seq(oid(OID.commonName), utf8(cn))));

/**
 * テスト用の RSA 鍵ペアと X.509 証明書（自己署名）を作る。
 * @returns {{ privateKey: import('node:crypto').KeyObject, certDer: Buffer, certB64: string }}
 */
export function makeTestCertificate(cn = 'parity-test') {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ type: 'spki', format: 'der' });

  const sigAlg = seq(oid(OID.sha256WithRSA), nullVal());
  const serial = int(randomBytes(8).map((b, i) => (i === 0 ? b & 0x7f : b)));
  const validity = seq(utcTime('250101000000Z'), utcTime('350101000000Z'));

  const tbs = seq(
    explicit(0, int(Buffer.from([2]))), // version v3
    serial,
    sigAlg,
    name(cn),
    validity,
    name(cn),
    spki,
  );
  const signature = sign('sha256', tbs, { key: privateKey, padding: constants.RSA_PKCS1_PADDING });
  const certDer = seq(tbs, sigAlg, bitString(signature));

  return {
    privateKey,
    certDer,
    certB64: certDer.toString('base64'),
    spki,
  };
}

/** RSASSA-PKCS1-v1_5 / SHA-256 で署名して base64 を返す */
export function signSha256Base64(data, privateKey) {
  return sign('sha256', data, { key: privateKey, padding: constants.RSA_PKCS1_PADDING }).toString(
    'base64',
  );
}

export { octetString };
