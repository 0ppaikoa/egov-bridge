// タグマッピングエンジン本体（transcribeConfInfo / transcribeAppliData 相当）。
// 仕様の根拠: docs/tag-mapping-spec.md（デコンパイル eGovClient.dll の解析結果）。
//
// 対応する規則コンテナ:
//   対応規則   → transcribeConfInfo 専用（構成情報 → 申請データ）
//   対応規則1/1g → transcribeAppliData の FromTo（申請データ → 申請データ）
//   対応規則2/2g → transcribeAppliData の Sync（申請データ → 申請データ）
import { parseXml, serializeXml, elementsByTag, textContent } from './xmlutil.ts';
import {
  buildTagIndex,
  getNodesByRelativeOrderXPath,
  getValueByNode,
  isLeafElement,
} from './pathx.ts';

type AnyNode = {
  nodeType: number;
  nodeName?: string;
  tagName?: string;
  childNodes?: ArrayLike<AnyNode>;
  firstChild?: AnyNode | null;
  data?: string;
  nodeValue?: string | null;
};
type AnyDoc = { documentElement: AnyNode; createTextNode(s: string): AnyNode } & AnyNode;

const ELEMENT_NODE = 1;

interface RuleElement {
  /** 1=申請書タグ名 2=子申請書タグ名 3=構成管理情報タグ名 4=仕切り */
  type: 1 | 2 | 3 | 4;
  value: string;
}

export interface MappingRule {
  elements: RuleElement[];
}

const TAG_NAMES: Record<string, 1 | 2 | 3 | 4> = {
  申請書タグ名: 1,
  子申請書タグ名: 2,
  構成管理情報タグ名: 3,
  仕切り: 4,
};

function ruleElements(container: Element): RuleElement[] {
  const out: RuleElement[] = [];
  const kids = (container as unknown as { childNodes: ArrayLike<AnyNode> }).childNodes;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i] as AnyNode;
    if (c.nodeType !== ELEMENT_NODE) continue;
    const name = c.nodeName ?? c.tagName ?? '';
    const type = TAG_NAMES[name];
    if (!type) continue; // 未知要素は無視（ネイティブは extracts で拾わない）
    out.push({ type, value: textContent(c as unknown as Element) });
  }
  return out;
}

/** tagMapping XML から「対応規則」（transcribeConfInfo 用）を取り出す */
export function parseConfInfoRules(tagMappingXml: string): MappingRule[] {
  const doc = parseXml(tagMappingXml) as unknown as AnyDoc;
  const out: MappingRule[] = [];
  for (const container of elementsByTag(doc as unknown as Document, '対応規則')) {
    out.push({ elements: ruleElements(container) });
  }
  return out;
}

/** transcribeConfInfo: 構成情報の値を申請データXMLへ転記する */
export interface TranscribeResult {
  /** 適用に成功した規則数 */
  ruleCount: number;
  /** 警告で飛ばした規則の情報 */
  warnings: string[];
  /** 書き換え後の申請データ（ファイル名 → XML文字列） */
  files: Map<string, string>;
}

export function transcribeConfInfo(
  confInfoXml: string,
  tagMappingXml: string,
  appliFiles: Map<string, string>,
): TranscribeResult {
  const confDoc = parseXml(confInfoXml) as unknown as AnyDoc;
  const rules = parseConfInfoRules(tagMappingXml);
  const warnings: string[] = [];

  // 申請データをパースして保持
  const docs = new Map<string, AnyDoc>();
  for (const [name, xml] of appliFiles) docs.set(name, parseXml(xml) as unknown as AnyDoc);

  let ruleCount = 0;

  for (const rule of rules) {
    const appliTags: RuleElement[] = [];
    const childTags: RuleElement[] = [];
    let posting = '';
    let failed = false;

    for (const el of rule.elements) {
      if (el.type === 1) appliTags.push(el);
      else if (el.type === 2) childTags.push(el);
      else if (el.type === 3) {
        const nodes = getNodesByRelativeOrderXPath(confDoc as unknown as AnyNode, el.value);
        if (nodes === null) {
          // 一致 0 件は規則ごとスキップ（ネイティブは Warning を投げて握る）
          warnings.push(`xPath:${el.value}`);
          failed = true;
          break;
        }
        const v = getValueByNode(nodes[0] as AnyNode);
        posting += v === null ? '' : v;
      } else {
        posting += el.value;
      }
    }
    if (failed) continue;

    if (appliTags.length > 0) {
      for (const doc of docs.values()) {
        for (const t of appliTags) replaceTagValue(doc, t.value, posting);
      }
    }
    if (childTags.length > 0) {
      for (const doc of docs.values()) {
        for (const t of childTags) replaceLastTagValue(doc, t.value, posting);
      }
    }
    ruleCount++;
  }

  const files = new Map<string, string>();
  // ruleCount > 0 のときだけ書き戻す（ネイティブと同じ）
  if (ruleCount > 0) {
    for (const [name, doc] of docs) files.set(name, serializeXml(doc as unknown as Document));
  }
  return { ruleCount, warnings, files };
}

/** 一致した全ノードの値を置換（AppliFile.replaceTagValue 66418） */
function replaceTagValue(doc: AnyDoc, xpath: string, value: string): void {
  const nodes = getNodesByRelativeOrderXPath(doc as unknown as AnyNode, xpath);
  if (nodes === null) return;
  for (const n of nodes) setNodeText(doc, n as AnyNode, value);
}

/** 要素名で引き、葉要素すべての値を置換（AppliFile.replaceLastTagValue 66450） */
function replaceLastTagValue(doc: AnyDoc, tagName: string, value: string): void {
  // ネイティブは extracts(map, document) の結果を map[tagName] で引く。
  // extracts は要素以外を無視するため、ルート要素のキーは "/DataRoot" になる。
  // 深い要素は "/DataRoot/.../<tagName>" なので、**末尾一致**で探す必要がある。
  const index = buildTagIndex(doc as unknown as AnyNode);
  const nodes: AnyNode[] = [];
  for (const [key, arr] of index) {
    if (key === '/' + tagName || key.endsWith('/' + tagName)) nodes.push(...arr);
  }
  if (nodes.length === 0) return;
  for (const n of nodes) if (isLeafElement(n)) setNodeText(doc, n, value);
}

/** 最初のテキスト子を差し替える（replaceChild(text, firstChild) 相当） */
function setNodeText(doc: AnyDoc, node: AnyNode, value: string): void {
  const target = node as unknown as {
    childNodes: ArrayLike<AnyNode>;
    firstChild: AnyNode | null;
    appendChild(n: AnyNode): AnyNode;
    replaceChild(a: AnyNode, b: AnyNode): AnyNode;
  };
  // ネイティブは document.CreateTextNode を使う（ノードの ownerDocument ではない）。
  const t = doc.createTextNode(value);
  if (target.childNodes.length === 0) {
    target.appendChild(t as never);
  } else {
    target.replaceChild(t as never, target.firstChild as never);
  }
}
