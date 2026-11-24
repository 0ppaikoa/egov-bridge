// Inclusive Canonical XML 1.0（コメント非含有）— REC-xml-c14n-20010315
//
// 依存ゼロ実装。ブラウザ（MAIN world）で動く必要があるため Node の util/crypto を
// 要求する xml-crypto は使わない（Vite が空モジュールへ差し替え、モジュール初期化時に
// util.deprecate 呼び出しで content script ごと落ちる）。
// 正しさは .NET の XmlDsigC14NTransform をオラクルに scripts/parity-csharp.mjs で検証する。
// 出力は JS 文字列。バイト列が必要な場合は呼び出し側で UTF-8 エンコードする。

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');
}

interface AttrLike {
  name: string;
  value: string;
  namespaceURI?: string | null;
  localName?: string | null;
}

// 要素自身を含め、文書ルートから el まで遡った in-scope 名前空間マップ
function collectInScope(el: Element): Map<string, string> {
  const chain: Element[] = [];
  let n: Node | null = el;
  while (n && n.nodeType === 1) {
    chain.push(n as unknown as Element);
    n = n.parentNode;
  }
  chain.reverse();
  const scope = new Map<string, string>();
  for (const e of chain) {
    for (let i = 0; i < e.attributes.length; i++) {
      const a = e.attributes[i] as unknown as AttrLike;
      if (a.name === 'xmlns') scope.set('', a.value);
      else if (a.name.startsWith('xmlns:')) scope.set(a.name.slice(6), a.value);
    }
  }
  return scope;
}

const attrSortKey = (a: AttrLike) => (a.namespaceURI || '') + '\0' + (a.localName || a.name);

function canonicalizeElement(el: Element, rendered: Map<string, string>): string {
  const fullScope = collectInScope(el);

  // この要素で新たに出力すべき名前空間（まだ rendered されていないもの）
  const toEmit: [string, string][] = [];
  for (const [prefix, uri] of fullScope)
    if (rendered.get(prefix) !== uri) toEmit.push([prefix, uri]);
  toEmit.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)); // '' = default が先頭

  const childRendered = new Map(rendered);
  for (const [p, u] of toEmit) childRendered.set(p, u);

  let s = '<' + el.tagName;
  for (const [prefix, uri] of toEmit) {
    s += prefix === '' ? ` xmlns="${escapeAttr(uri)}"` : ` xmlns:${prefix}="${escapeAttr(uri)}"`;
  }

  const attrs: AttrLike[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i] as unknown as AttrLike;
    if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue;
    attrs.push(a);
  }
  attrs.sort((a, b) => {
    const ka = attrSortKey(a);
    const kb = attrSortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  for (const a of attrs) s += ` ${a.name}="${escapeAttr(a.value)}"`;
  s += '>';

  for (let n = el.firstChild; n; n = n.nextSibling) {
    const t = n.nodeType;
    if (t === 1) s += canonicalizeElement(n as unknown as Element, childRendered);
    else if (t === 3 || t === 4)
      s += escapeText((n as unknown as { data: string }).data); // text / CDATA
    else if (t === 7) {
      const pi = n as unknown as { target: string; data: string };
      s += `<?${pi.target}${pi.data ? ' ' + pi.data : ''}?>`;
    }
    // コメント(8) は捨てる
  }
  s += '</' + el.tagName + '>';
  return s;
}

// node: Element（部分木）または Document。部分木の場合、祖先の名前空間は apex に集約される。
export function c14n(node: unknown): string {
  const n = node as { nodeType: number; documentElement?: Element | null } | null;
  const target = n?.nodeType === 9 ? n.documentElement : (node as Element);
  if (!target || target.nodeType !== 1) {
    throw new Error('c14n: unsupported node type ' + (n ? n.nodeType : 'null'));
  }
  return canonicalizeElement(target, new Map());
}
