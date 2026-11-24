// XML署名まわりの実装。デジタル庁の公開仕様（構成管理情報の sig 構造）と
// ネイティブアプリのデコンパイル結果を一次情報として再構成したもの。
//
// 要点:
//  - 署名対象は <構成情報> 部分木 + 申請書ファイル + 添付ファイルのみ（他のタグは対象外）
//  - 参照の順序: 構成情報 → 申請書ファイル（文書順） → 添付（文書順）
//  - 参照URI: 構成情報は "#" + WebUtility.UrlEncode("構成情報")、
//    申請書ファイルはファイル名そのまま、添付ファイルは WebUtility.UrlEncode(ファイル名)
//  - 構成情報は C14N 変換あり、ファイル群は変換なし。ダイジェストは SHA-256
import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { c14n } from '../c14n.ts';
import { bytesToBase64, base64ToBytes, sha256, webUtilityUrlEncode } from './bytes.ts';
import {
  parseXml,
  elementsByTag,
  firstElementByTag,
  textContent,
  serializeXml,
} from './xmlutil.ts';

export interface DigestRef {
  uri: string;
  digestValue: string;
  withC14nTransform: boolean;
}

const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

// .NET の署名Id: yyyyMMddHHmmss（ローカル時刻）
export function signatureTimestampId(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** 署名対象ファイル集合を集めてダイジェストを計算する */
export async function collectReferences(
  kouseiXml: string,
  files: Map<string, Uint8Array>,
): Promise<DigestRef[]> {
  const doc = parseXml(kouseiXml);
  const kosei = firstElementByTag(doc, '構成情報');
  if (!kosei) throw new Error('構成情報要素が見つかりません');

  const refs: DigestRef[] = [];

  // 1) 構成情報（C14N 変換あり）
  const koseiCanonical = c14n(kosei);
  const koseiDigest = await sha256(new TextEncoder().encode(koseiCanonical));
  refs.push({
    uri: '#' + webUtilityUrlEncode('構成情報'),
    digestValue: bytesToBase64(koseiDigest),
    withC14nTransform: true,
  });

  // 2) 申請書ファイル（URI はファイル名そのまま）
  for (const el of elementsByTag(doc, '申請書ファイル名称')) {
    const name = textContent(el);
    if (!name) continue;
    const data = files.get(name);
    if (!data) throw new Error(`申請書ファイルが見つかりません: ${name}`);
    refs.push({
      uri: name,
      digestValue: bytesToBase64(await sha256(data)),
      withC14nTransform: false,
    });
  }

  // 3) 添付書類（提出情報=1 かつ 添付種別=添付）。URI はパーセントエンコード
  const names = elementsByTag(doc, '添付書類ファイル名称');
  const kinds = elementsByTag(doc, '添付種別');
  const submits = elementsByTag(doc, '提出情報');
  const invalidChars = /[\\%<>{}[\]\s\u3000#^?]/; // ネイティブ実装の禁止文字集合
  for (let i = 0; i < names.length; i++) {
    const kind = textContent(kinds[i]);
    const submit = textContent(submits[i]);
    const name = textContent(names[i]);
    if (submit === '1' && kind === '添付') {
      if (invalidChars.test(name)) {
        throw new Error(`添付ファイル名に使用できない文字が含まれています: ${name}`);
      }
      const data = files.get(name);
      if (!data) throw new Error(`添付ファイルが見つかりません: ${name}`);
      refs.push({
        uri: webUtilityUrlEncode(name),
        digestValue: bytesToBase64(await sha256(data)),
        withC14nTransform: false,
      });
    } else if (submit === '1' && kind !== 'URL' && kind !== 'ＵＲＬ' && kind !== '別送') {
      throw new Error(`不正な添付種別です: ${kind}`);
    }
  }
  return refs;
}

/** SignedInfo 要素の XML 文字列を組み立てる（署名値はまだ含まない） */
export function buildSignedInfoXml(refs: DigestRef[]): string {
  const parts: string[] = [];
  parts.push(`<SignedInfo xmlns="${DSIG_NS}">`);
  parts.push(`<CanonicalizationMethod Algorithm="${C14N}"/>`);
  parts.push(`<SignatureMethod Algorithm="${RSA_SHA256}"/>`);
  for (const r of refs) {
    parts.push(`<Reference URI="${escAttr(r.uri)}">`);
    if (r.withC14nTransform) {
      parts.push(`<Transforms><Transform Algorithm="${C14N}"/></Transforms>`);
    }
    parts.push(`<DigestMethod Algorithm="${SHA256}"/>`);
    parts.push(`<DigestValue>${r.digestValue}</DigestValue>`);
    parts.push(`</Reference>`);
  }
  parts.push(`</SignedInfo>`);
  return parts.join('');
}

export interface SigningPreparation {
  signatureId: string;
  signedInfoXml: string;
  /** デジタル認証 API に送る Base64(C14N(SignedInfo)) */
  base64CanonicalData: string;
  /** assembly/検証で使う参照ダイジェスト一覧（署名済みXML再構成用） */
  refs: DigestRef[];
}

/** 署名に必要な SignedInfo を構築し、start-sign への投入データを返す */
export async function prepareSigning(
  kouseiXml: string,
  files: Map<string, Uint8Array>,
  signatureId: string = signatureTimestampId(),
): Promise<SigningPreparation> {
  const refs = await collectReferences(kouseiXml, files);
  const signedInfoXml = buildSignedInfoXml(refs);
  // C14N は「SignedInfo 単体のドキュメント」として評価する（ネイティブ実装と同じ）
  const doc = new DOMParser().parseFromString(
    `<Signature xmlns="${DSIG_NS}" Id="${signatureId}">${signedInfoXml}</Signature>`,
    'application/xml',
  );
  const root = doc.documentElement;
  if (!root) throw new Error('SignedInfo ドキュメントの生成に失敗しました');
  const signedInfoEl = root.firstChild;
  if (!signedInfoEl) throw new Error('SignedInfo 要素がありません');
  const canonical = c14n(signedInfoEl as unknown as Element);
  return {
    signatureId,
    signedInfoXml,
    base64CanonicalData: bytesToBase64(new TextEncoder().encode(canonical)),
    refs,
  };
}

export interface AssembledSignature {
  /** 署名情報を埋め込んだ完全な XML 文字列 */
  xml: string;
}

/** サーバ（デジタル認証）から返った署名値と証明書を <署名情報> に埋め込む */
export function assembleSignedXml(
  kouseiXml: string,
  refs: DigestRef[],
  signatureId: string,
  signatureB64: string,
  certificateB64: string,
): string {
  const doc = parseXml(kouseiXml);
  const root = doc.documentElement as unknown as Element | null;
  if (!root) throw new Error('構成情報XMLのパースに失敗しました');

  // <署名情報> が無ければ <構成情報> の直後に挿入（無ければ末尾）
  let signInfo = firstElementByTag(doc, '署名情報');
  if (!signInfo) {
    signInfo = doc.createElement('署名情報') as unknown as Element;
    const kosei = firstElementByTag(doc, '構成情報');
    if (kosei && kosei.parentNode) {
      (kosei.parentNode as unknown as { insertBefore(a: unknown, b: unknown): void }).insertBefore(
        signInfo,
        (kosei as unknown as { nextSibling: unknown }).nextSibling,
      );
    } else {
      root.appendChild(signInfo as unknown as Node);
    }
  }

  const signatureXml =
    `<Signature xmlns="${DSIG_NS}" Id="${signatureId}">` +
    buildSignedInfoXml(refs) +
    `<SignatureValue>${signatureB64}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certificateB64.replace(/\s+/g, '')}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;
  const fragDoc = new DOMParser().parseFromString(signatureXml, 'application/xml');
  const sigEl = fragDoc.documentElement as unknown as Element;
  const imported = doc.importNode(sigEl as unknown as Node, true);
  (signInfo as unknown as Element).appendChild(imported);
  return serializeXml(doc);
}

export interface VerifyResult {
  ok: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
}

/** 署名済み XML の検証: 署名値 + 構成情報の参照 digest（添付は files があれば） */
export async function verifySignatureXml(
  xml: string,
  files?: Map<string, Uint8Array>,
): Promise<VerifyResult> {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const doc = parseXml(xml);
  const sig = firstElementByTag(doc, 'Signature');
  if (!sig) {
    return {
      ok: false,
      checks: [{ name: 'signature-present', ok: false, detail: '署名情報がありません' }],
    };
  }
  const signedInfo = firstElementByTag(sig as unknown as Element, 'SignedInfo');
  const sigValueEl = firstElementByTag(sig as unknown as Element, 'SignatureValue');
  const certEl = firstElementByTag(sig as unknown as Element, 'X509Certificate');
  if (!signedInfo || !sigValueEl || !certEl) {
    return {
      ok: false,
      checks: [{ name: 'signature-structure', ok: false, detail: '必須要素が欠けています' }],
    };
  }

  // SignedInfo の C14N バイト列
  const canonical = c14n(signedInfo);
  const data = new TextEncoder().encode(canonical);

  try {
    const der = base64ToBytes(textContent(certEl).replace(/\s+/g, ''));
    const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(der));
    const cert = forge.pki.certificateFromAsn1(asn1);
    const md = forge.md.sha256.create();
    md.update(forge.util.binary.raw.encode(data));
    const sigBytes = forge.util.binary.raw.encode(
      base64ToBytes(textContent(sigValueEl).replace(/\s+/g, '')),
    );
    const ok = (cert.publicKey as forge.pki.rsa.PublicKey).verify(md.digest().getBytes(), sigBytes);
    checks.push({ name: 'signature-value', ok });
  } catch (e) {
    checks.push({ name: 'signature-value', ok: false, detail: String(e) });
  }

  // 参照 digest の再計算（構成情報）
  for (const ref of Array.from((sig as unknown as Element).getElementsByTagName('Reference'))) {
    const uri = (ref as Element).getAttribute('URI') ?? '';
    const digestEl = (ref as Element).getElementsByTagName('DigestValue')[0];
    const expected = digestEl?.textContent?.trim() ?? '';
    try {
      if (uri === '#' + webUtilityUrlEncode('構成情報')) {
        const kosei = firstElementByTag(doc, '構成情報');
        const digest = await sha256(new TextEncoder().encode(c14n(kosei as Element)));
        checks.push({ name: `digest:${uri}`, ok: bytesToBase64(digest) === expected });
      } else if (files) {
        const name = uri.startsWith('#') ? null : decodeURIComponent(uri);
        const data = name ? files.get(name) : undefined;
        if (data) {
          const digest = await sha256(data);
          checks.push({ name: `digest:${uri}`, ok: bytesToBase64(digest) === expected });
        } else {
          checks.push({ name: `digest:${uri}`, ok: false, detail: '検証用ファイルが未提供' });
        }
      }
    } catch (e) {
      checks.push({ name: `digest:${uri}`, ok: false, detail: String(e) });
    }
  }

  return { ok: checks.length > 0 && checks.every((c) => c.ok), checks };
}
