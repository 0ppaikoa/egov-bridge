// 最小限の DER (ASN.1) 走査。X.509 証明書から SubjectPublicKeyInfo を取り出すためだけの実装。
// node-forge (約1MB) をバンドルから追い出すために自前で持つ。汎用 ASN.1 パーサではない。

interface Tlv {
  tag: number;
  /** 値の開始位置（length バイトの後） */
  start: number;
  /** 値の終了位置（排他） */
  end: number;
}

function readTlv(buf: Uint8Array, offset: number): Tlv {
  if (offset + 2 > buf.length) throw new Error('DER: truncated');
  const tag = buf[offset];
  let p = offset + 1;
  let len = buf[p++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('DER: unsupported length');
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[p++];
  }
  const start = p;
  const end = p + len;
  if (end > buf.length) throw new Error('DER: length exceeds buffer');
  return { tag, start, end };
}

/** SEQUENCE (0x30) の直接の子要素を列挙する */
function children(buf: Uint8Array, tlv: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let p = tlv.start;
  while (p < tlv.end) {
    const child = readTlv(buf, p);
    out.push(child);
    p = child.end;
  }
  return out;
}

const TAG_SEQUENCE = 0x30;
const TAG_BIT_STRING = 0x03;

/**
 * X.509 証明書 DER から SubjectPublicKeyInfo の DER を取り出す。
 * Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
 * TBSCertificate ::= SEQUENCE { [0] version?, serialNumber, signature, issuer, validity,
 *                               subject, subjectPublicKeyInfo, ... }
 * version の有無で位置がずれるため、位置決め打ちではなく
 * 「子が SEQUENCE(AlgorithmIdentifier) + BIT STRING の SEQUENCE」を探す。
 */
export function extractSpkiFromCertificate(certDer: Uint8Array): Uint8Array {
  const cert = readTlv(certDer, 0);
  if (cert.tag !== TAG_SEQUENCE) throw new Error('DER: certificate is not a SEQUENCE');
  const tbs = children(certDer, cert)[0];
  if (!tbs || tbs.tag !== TAG_SEQUENCE) throw new Error('DER: tbsCertificate not found');

  for (const child of children(certDer, tbs)) {
    if (child.tag !== TAG_SEQUENCE) continue;
    const inner = children(certDer, child);
    if (inner.length === 2 && inner[0].tag === TAG_SEQUENCE && inner[1].tag === TAG_BIT_STRING) {
      // SPKI 全体（タグ・長さ・値を含む）を切り出す
      return certDer.subarray(offsetOfHeader(certDer, child), child.end);
    }
  }
  throw new Error('DER: SubjectPublicKeyInfo not found');
}

// readTlv が返す start は「長さの後」。ヘッダ込みの開始位置を逆算する。
function offsetOfHeader(buf: Uint8Array, tlv: Tlv): number {
  // タグ1バイト + 長さ1〜5バイト。start から遡って長さ表現を特定する。
  for (let back = 2; back <= 6; back++) {
    const off = tlv.start - back;
    if (off < 0) break;
    try {
      const t = readTlv(buf, off);
      if (t.start === tlv.start && t.end === tlv.end && t.tag === tlv.tag) return off;
    } catch {
      // 次の候補へ
    }
  }
  throw new Error('DER: cannot locate TLV header');
}

/** 証明書 DER から RSA 公開鍵を WebCrypto に読み込む */
export async function importRsaPublicKeyFromCertificate(certDer: Uint8Array): Promise<CryptoKey> {
  const spki = extractSpkiFromCertificate(certDer);
  return crypto.subtle.importKey(
    'spki',
    spki as unknown as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}
