// Inclusive Canonical XML 1.0（コメント非含有）— REC-xml-c14n-20010315
// 実装は xml-crypto 同梱の C14nCanonicalization に委譲する（inclusive c14n を正しく実装している）。
// 出力は JS 文字列。バイト列が必要な場合は呼び出し側で UTF-8 エンコードする。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { C14nCanonicalization } = require('xml-crypto/lib/c14n-canonicalization.js');

const canonicalizer = new C14nCanonicalization();

// node: Element または Document。部分木を渡した場合、祖先の名前空間は apex に集約される
// （inclusive c14n の仕様どおり）。
export function c14n(node) {
  const target = node.nodeType === 9 ? node.documentElement : node;
  if (!target || target.nodeType !== 1) {
    throw new Error('c14n: unsupported node type ' + (node && node.nodeType));
  }
  return canonicalizer.process(target, []);
}
