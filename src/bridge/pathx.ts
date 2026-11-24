// OperateDocument 相当（デコンパイル 75639–76100）の再実装。
//
// 重要: ネイティブは System.Xml の XPath を使わず、自前のパス解決器を使う。
//  - 区切りは "/"、空セグメントは無視（先頭・末尾・連続 "/" を許容）
//  - 各セグメントは「タグ名」または「タグ名[n]」（1 始まり）
//  - 名前空間は一切考慮せず、Name（接頭辞込みの完全名）で照合
//  - 相対パスの基点ノード自身は「含めない」（子から探索）
//  - "a[1][2]" のような 3 分割以上はそのセグメントを無視して続行
//
// 出力の byte 一致を優先し、独自の解釈は入れない。挙動の根拠は docs/tag-mapping-spec.md §3.0。

interface AnyNode {
  nodeType: number;
  nodeName?: string;
  tagName?: string;
  childNodes?: ArrayLike<AnyNode>;
  firstChild?: AnyNode | null;
  nodeValue?: string | null;
  data?: string;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;
const WHITESPACE_NODE = 13;
const SIGNIFICANT_WHITESPACE_NODE = 14;

/** path.split("/").filter(nonEmpty) */
export function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s !== '');
}

function nameOf(n: AnyNode): string {
  return (n as { nodeName?: string; tagName?: string }).nodeName ?? n.tagName ?? '';
}

function childList(n: AnyNode): AnyNode[] {
  const cs = n.childNodes;
  const out: AnyNode[] = [];
  if (!cs) return out;
  for (let i = 0; i < cs.length; i++) out.push(cs[i] as AnyNode);
  return out;
}

/** 直子のうちタグ名が完全一致する要素 */
function getNodesByTagName(nodes: AnyNode[], tag: string): AnyNode[] {
  const out: AnyNode[] = [];
  for (const n of nodes) {
    for (const c of childList(n)) {
      if (c.nodeType === ELEMENT_NODE && nameOf(c) === tag) out.push(c);
    }
  }
  return out;
}

/** 基点ノードを含めず、直子から辿る（getNodesByRelativeXPath 75757） */
export function getNodesByRelativeXPath(node: AnyNode, path: string): AnyNode[] | null {
  let list: AnyNode[] = [node];
  for (const seg of splitPath(path)) {
    list = getNodesByTagName(list, seg);
    if (list.length === 0) return null;
  }
  return list;
}

/** [n] 添字に対応する主経路（getNodesByRelativeOrderXPath 75787） */
export function getNodesByRelativeOrderXPath(node: AnyNode, path: string): AnyNode[] | null {
  let list: AnyNode[] = [node];
  for (const seg of splitPath(path)) {
    const parts = seg.split(/[[\]]/).filter((s) => s !== '');
    if (parts.length === 1) {
      list = getNodesByTagName(list, seg);
      if (list.length === 0) return null;
    } else if (parts.length === 2) {
      const n = Number.parseInt(parts[1] ?? '', 10);
      const next: AnyNode[] = [];
      for (const p of list) {
        const kids = getNodesByTagName([p], parts[0] ?? '');
        if (kids.length > 0 && kids.length >= n) next.push(kids[n - 1] as AnyNode);
      }
      if (next.length === 0) return null;
      list = next;
    }
    // parts.length >= 3 はそのセグメントを無視して続行（ネイティブ同様）
  }
  return list;
}

/** 最初のテキスト子だけを値とする（getValueByNode 75706） */
export function getValueByNode(node: AnyNode | null | undefined): string | null {
  if (!node) return null;
  const kids = childList(node);
  if (kids.length === 0) return null;
  const c = kids[0] as AnyNode;
  const t = c.nodeType;
  if (
    t !== TEXT_NODE &&
    t !== WHITESPACE_NODE &&
    t !== SIGNIFICANT_WHITESPACE_NODE &&
    t !== CDATA_NODE
  ) {
    return null;
  }
  return c.data ?? c.nodeValue ?? '';
}

/** 子に要素を持たない要素（isLeafElement 76034） */
export function isLeafElement(node: AnyNode): boolean {
  if (node.nodeType !== ELEMENT_NODE) return false;
  for (const c of childList(node)) if (c.nodeType === ELEMENT_NODE) return false;
  return true;
}

/**
 * 文書全体を「prefix/名前 → ノード配列」に索引化する（extracts 75890）。
 * ルート要素は prefix="" で key="/名前" になる点までネイティブに合わせる。
 */
export function buildTagIndex(doc: AnyNode): Map<string, AnyNode[]> {
  const map = new Map<string, AnyNode[]>();
  const walk = (prefix: string, node: AnyNode) => {
    if (node.nodeType !== ELEMENT_NODE) return;
    const key = prefix + '/' + nameOf(node);
    const arr = map.get(key);
    if (arr) arr.push(node);
    else map.set(key, [node]);
    for (const c of childList(node)) walk(key, c);
  };
  // ネイティブ extracts は Document を受け取り、要素以外を無視して子へ降りる。
  // Document(9) 自身はキーを持たないので、子（= documentElement）から走査する。
  for (const c of childList(doc as AnyNode)) walk('', c);
  return map;
}

/** 要素を空要素化してよいか（InnerXml == "" の要素を <a/> にする準備） */
export function isEmptyElement(node: AnyNode): boolean {
  const kids = childList(node);
  if (kids.length === 0) return true;
  for (const c of kids) {
    if (c.nodeType === ELEMENT_NODE) return false;
    if ((c.data ?? c.nodeValue ?? '') !== '') return false;
  }
  return true;
}
