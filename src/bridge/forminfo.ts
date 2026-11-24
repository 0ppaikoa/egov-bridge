// F3egclXMLDataAppli_setXMLFormInfo / getXMLFormInfo の再実装。
// 根拠: eGovClient.dll.decompiled.cs
//   - F3egclXMLDataAppli_setXMLFormInfo 13355 / getXMLFormInfo 14012
//   - XMLDataAppli.setXMLFormInfo 85302 / getXMLFormInfo 85556 / getItemValue 85967 /
//     setItemValue 86006 / getXMLDoc 85661 / getHexXMLDoc 85686
//   - ItemXMLMapping 75380（map/itemName/xpath/repeat）
//   - OperateDocument.decimalToHex 76200 / hexToDecimal 76220（"&#xHEX;" 連結形式）
//
// 対応範囲: 繰り返し項目（map に <repeat> を持つ項目）は未対応。明示エラーにする。
// 31751（労働保険料等還付請求）は単一様式・繰り返しなしを想定。
import { parseXml, serializeXml, elementsByTag, textContent } from './xmlutil.ts';
import { getNodesByRelativeOrderXPath, getValueByNode } from './pathx.ts';

type AnyNode = {
  nodeType: number;
  nodeName?: string;
  childNodes?: ArrayLike<AnyNode>;
  firstChild?: AnyNode | null;
  data?: string;
  nodeValue?: string | null;
};
type AnyDoc = { documentElement: AnyNode };

export type PageEval = (js: string) => unknown;

function defaultPageEval(): PageEval | null {
  const w = (globalThis as { window?: { eval?: unknown } }).window;
  if (w && typeof w.eval === 'function')
    return (js: string) => (w.eval as (s: string) => unknown)(js);
  return null;
}

/** ネイティブの "&#xHEX;" 連結形式（decimalToHex 76200） */
export function decimalToHex(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) out += `&#x${s.charCodeAt(i).toString(16).toUpperCase()};`;
  return out;
}

/** ネイティブの hexToDecimal（76220） */
export function hexToDecimal(s: string): string {
  let out = '';
  for (const part of s.split(';')) {
    if (part.length === 0) continue;
    const hex = part.slice('&#x'.length);
    out += String.fromCodePoint(Number.parseInt(hex, 16));
  }
  return out;
}

export interface MappingItem {
  name: string;
  xpath: string;
  isRepeat: boolean;
}

/** ItemXMLMapping（75380）: document の <map> を順に読む */
export function parseItemMapping(mappingXml: string): MappingItem[] {
  const doc = parseXml(mappingXml);
  const maps = elementsByTag(doc, 'map');
  if (maps.length === 0) throw new Error('マッピング情報なし');
  const items: MappingItem[] = [];
  for (const map of maps) {
    const nameEl = elementsByTag(map, 'itemName')[0];
    const xpathEl = elementsByTag(map, 'xpath')[0];
    const repeatEl = elementsByTag(map, 'repeat')[0];
    if (!nameEl) throw new Error('マッピング情報の項目名なし');
    if (!xpathEl) throw new Error('マッピング情報のXPathなし');
    items.push({
      name: textContent(nameEl),
      xpath: textContent(xpathEl),
      isRepeat: Boolean(repeatEl),
    });
  }
  return items;
}

/** 作業XML（FormData 相当）への値の読み書き */
class FormData {
  private doc: AnyDoc;

  constructor(doc: AnyDoc) {
    this.doc = doc;
  }

  private resolve(xpath: string): AnyNode | null {
    const nodes = getNodesByRelativeOrderXPath(this.doc as unknown as AnyNode, xpath);
    return nodes && nodes.length > 0 ? (nodes[0] as AnyNode) : null;
  }

  hasElement(xpath: string): boolean {
    return this.resolve(xpath) !== null;
  }

  getValue(xpath: string): string | null {
    const node = this.resolve(xpath);
    return node ? getValueByNode(node) : null;
  }

  setValue(xpath: string, value: string): void {
    const node = this.resolve(xpath);
    if (!node) throw new Error(`XPATH が見つかりません: ${xpath}`);
    const target = node as unknown as {
      childNodes: ArrayLike<AnyNode>;
      firstChild: AnyNode | null;
      appendChild(n: unknown): unknown;
      replaceChild(a: unknown, b: unknown): unknown;
    };
    const doc = this.doc as unknown as { createTextNode(s: string): unknown };
    const textNode = doc.createTextNode(value);
    if (target.childNodes.length === 0) target.appendChild(textNode);
    else target.replaceChild(textNode, target.firstChild);
  }

  toString(): string {
    return serializeXml(this.doc as unknown as Document);
  }
}

function requirePageEval(pageEval?: PageEval): PageEval {
  const fn = pageEval ?? defaultPageEval();
  if (!fn) throw new Error('ページコンテキストがありません');
  return fn;
}

function callPage(fn: PageEval, code: string): unknown {
  return fn(`(function(){ try { return ${code}; } catch (e) { return -1; } })()`);
}

/**
 * F3egclXMLDataAppli_setXMLFormInfo（13355）
 * args: [xmlDoc, mappingXMLDoc, structureXMLDoc, repeatXMLDoc]
 * XML の値をページのフォームへ反映し、最後に更新後 XML を hex でページへ渡す。
 */
export function setXMLFormInfo(args: string[], pageEval?: PageEval): number {
  const [xmlDoc, mappingXMLDoc, structureXMLDoc] = args;
  if (!xmlDoc) throw new Error('xmlDoc:null');
  if (!mappingXMLDoc) throw new Error('mappingXMLDoc:null');
  if (!structureXMLDoc) throw new Error('structureXMLDoc:null');

  const items = parseItemMapping(mappingXMLDoc);
  const repeatItems = items.filter((i) => i.isRepeat);
  if (repeatItems.length > 0) {
    throw new Error(
      '未対応: 繰り返し項目（<repeat>）を含む様式には未対応です: ' +
        repeatItems.map((i) => i.name).join(', '),
    );
  }

  // ネイティブ同様、構造XML（hex）が壊れていればここで落とす
  parseXml(hexToDecimal(structureXMLDoc));

  const page = requirePageEval(pageEval);
  const form = new FormData(parseXml(xmlDoc) as unknown as AnyDoc);

  for (const item of items) {
    const value = form.getValue(item.xpath) ?? '';
    // ネイティブ: InvokeScriptWithErrorHandling("F3egclSetValueForXml", name, value)
    const result = callPage(
      page,
      `F3egclSetValueForXml(${JSON.stringify(item.name)}, ${JSON.stringify(value)})`,
    );
    if (typeof result === 'number' && result < 0) {
      throw new Error(`F3egclSetValueForXml が失敗しました: ${item.name}`);
    }
  }

  // ネイティブ: getHexXMLDoc → F3egclSetDataStructure(hex)
  const hex = decimalToHex(form.toString());
  const result = callPage(page, `F3egclSetDataStructure(${JSON.stringify(hex)})`);
  if (typeof result === 'number' && result < 0) {
    throw new Error('F3egclSetDataStructure が失敗しました');
  }
  return 0;
}

/**
 * F3egclXMLDataAppli_getXMLFormInfo（14012）
 * args: [structureXMLDoc, mappingXMLDoc, repeatXMLDoc]
 *
 * ネイティブ（85556）は structureXMLDoc を hexToDecimal → parse し、
 * それを DataStructure として getItemValue/setItemValue/getXMLDoc を行う。
 * つまりこの経路では「構造XML」が作業XMLそのもの。
 */
export function getXMLFormInfo(args: string[], pageEval?: PageEval): string {
  const [structureXMLDoc, mappingXMLDoc] = args;
  if (!structureXMLDoc) throw new Error('structureXMLDoc:null');
  if (!mappingXMLDoc) throw new Error('mappingXMLDoc:null');

  const items = parseItemMapping(mappingXMLDoc);
  const repeatItems = items.filter((i) => i.isRepeat);
  if (repeatItems.length > 0) {
    throw new Error(
      '未対応: 繰り返し項目（<repeat>）を含む様式には未対応です: ' +
        repeatItems.map((i) => i.name).join(', '),
    );
  }

  const page = requirePageEval(pageEval);
  const decoded = hexToDecimal(structureXMLDoc);
  const form = new FormData(parseXml(decoded) as unknown as AnyDoc);

  for (const item of items) {
    const value = callPage(page, `F3egclGetValue(${JSON.stringify(item.name)})`);
    if (typeof value === 'number' && value < 0) {
      throw new Error(`F3egclGetValue が失敗しました: ${item.name}`);
    }
    const text = value == null ? '' : String(value);
    form.setValue(item.xpath, text);
  }
  return form.toString();
}
