// Inclusive Canonical XML 1.0（コメント非含有）— REC-xml-c14n-20010315
// 実装は xml-crypto 同梱の C14nCanonicalization に委譲する（inclusive c14n を正しく実装している）。
// 出力は JS 文字列。バイト列が必要な場合は呼び出し側で UTF-8 エンコードする。
// 注意: ブラウザバンドル前提のため node:module は使わない。CJS は Vite が共通JS変換する。
import { C14nCanonicalization } from 'xml-crypto/lib/c14n-canonicalization.js';

const canonicalizer = new C14nCanonicalization();

// node: Element または Document。部分木を渡した場合、祖先の名前空間は apex に集約される
// （inclusive c14n の仕様どおり）。
export function c14n(node: unknown): string {
  const n = node as {
    nodeType: number;
    documentElement?: { nodeType: number } | null;
  } | null;
  const target = n?.nodeType === 9 ? n.documentElement : (n as unknown as { nodeType: number });
  if (!target || target.nodeType !== 1) {
    throw new Error('c14n: unsupported node type ' + (n ? n.nodeType : 'null'));
  }
  // xml-crypto は内部で DOM を再走査する。型は緩く受ける。
  return canonicalizer.process(target as never, {}) as string;
}
