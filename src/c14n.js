// Inclusive Canonical XML 1.0（コメント非含有）— http://www.w3.org/TR/2001/REC-xml-c14n-20010315
// 署名対象（SignedInfo / 構成情報サブツリー）を正規化するための実装。
// 出力は JS 文字列。バイト列が必要な場合は呼び出し側で UTF-8 エンコードする。
// 対応ノード: element / text / CDATASection / PI。doctype とコメントは無視。

function escapeText(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

function escapeAttr(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');
}

// 要素自身の xmlns 宣言を含め、文書ルートから el まで遡った in-scope 名前空間マップを返す
function collectInScope(el) {
  const chain = [];
  let n = el;
  while (n && n.nodeType === 1) { chain.push(n); n = n.parentNode; }
  chain.reverse();
  const scope = new Map();
  for (const e of chain) {
    for (let i = 0; i < e.attributes.length; i++) {
      const a = e.attributes[i];
      if (a.name === 'xmlns') scope.set('', a.value);
      else if (a.name.indexOf('xmlns:') === 0) scope.set(a.name.slice(6), a.value);
    }
  }
  return scope;
}

function regularAttrKey(a) {
  return (a.namespaceURI || '') + '\0' + (a.localName || a.name);
}

function canonicalizeElement(el, rendered) {
  const fullScope = collectInScope(el);

  // この要素で新たに出力すべき名前空間（ここまで rendered されていないもの）
  const toEmit = [];
  for (const [prefix, uri] of fullScope) {
    if (rendered.get(prefix) !== uri) toEmit.push([prefix, uri]);
  }
  toEmit.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)); // プレフィックス昇順（''=default が先頭）

  const childRendered = new Map(rendered);
  for (const [p, u] of toEmit) childRendered.set(p, u);

  let s = '<' + el.tagName;
  for (const [prefix, uri] of toEmit) {
    s += prefix === ''
      ? ' xmlns="' + escapeAttr(uri) + '"'
      : ' xmlns:' + prefix + '="' + escapeAttr(uri) + '"';
  }

  const attrs = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue;
    attrs.push(a);
  }
  attrs.sort((a, b) => {
    const ka = regularAttrKey(a), kb = regularAttrKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  for (const a of attrs) {
    s += ' ' + a.name + '="' + escapeAttr(a.value) + '"';
  }
  s += '>';

  for (let n = el.firstChild; n; n = n.nextSibling) {
    const t = n.nodeType;
    if (t === 1) s += canonicalizeElement(n, childRendered);
    else if (t === 3 || t === 4) s += escapeText(n.data); // text / CDATA
    else if (t === 7) s += '<?' + n.target + (n.data ? ' ' + n.data : '') + '?>'; // PI
    // コメント(8) は捨てる
  }
  s += '</' + el.tagName + '>';
  return s;
}

// node: Element（部分木）か Document。部分木の場合、祖先の名前空間は apex に集約して出力される。
export function c14n(node) {
  if (node.nodeType === 9) {
    const root = node.documentElement;
    if (!root) return '';
    return canonicalizeElement(root, new Map());
  }
  if (node.nodeType === 1) {
    return canonicalizeElement(node, new Map());
  }
  throw new Error('c14n: unsupported node type ' + node.nodeType);
}
