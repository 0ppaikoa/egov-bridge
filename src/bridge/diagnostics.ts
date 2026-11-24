// 診断情報の収集。ポップアップから chrome.scripting.executeScript で呼ばれる。
//
// 方針:
//  - 値（テキスト）は一切含めない。タグ名・属性名・件数だけ。
//  - 例外として mapping の itemName / xpath は「項目名とパス」であり構造情報なので含める。
//    （氏名などの「値」は含まれない）
//  - 個人情報を含み得るのは F3egclDataStructure（作業XML）の本文だが、これは件数だけ。
import { parseXml, elementsByTag, textContent } from './xmlutil.ts';

export interface XmlCensus {
  present: boolean;
  root?: string;
  tags: Record<string, number>;
  attrs: Record<string, number>;
  error?: string;
}

export interface MappingItemInfo {
  itemName: string;
  xpath: string;
  isRepeat: boolean;
}

export interface DiagnosticsDump {
  url: string;
  bridgeInstalled: boolean;
  commandLog: string[];
  mapping: XmlCensus & { items?: MappingItemInfo[] };
  structure: XmlCensus;
  repeat: XmlCensus;
}

/** ネイティブの "&#xHEX;" 連結形式をデコード（forminfo.ts と同じ規則） */
export function hexToDecimal(s: string): string {
  let out = '';
  for (const part of s.split(';')) {
    if (part.length === 0) continue;
    out += String.fromCodePoint(Number.parseInt(part.slice('&#x'.length), 16));
  }
  return out;
}

/** XML のタグ名・属性名だけを数える（テキストは読まない） */
export function census(xml: string): XmlCensus {
  if (!xml) return { present: false, tags: {}, attrs: {} };
  try {
    const doc = parseXml(xml);
    const tags: Record<string, number> = {};
    const attrs: Record<string, number> = {};
    const all = doc.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i] as unknown as {
        nodeName: string;
        attributes: ArrayLike<{ name: string }>;
      };
      tags[el.nodeName] = (tags[el.nodeName] ?? 0) + 1;
      for (let j = 0; j < el.attributes.length; j++) {
        const name = el.attributes[j].name;
        attrs[name] = (attrs[name] ?? 0) + 1;
      }
    }
    return { present: true, root: doc.documentElement?.nodeName, tags, attrs };
  } catch (e) {
    return { present: true, tags: {}, attrs: {}, error: String(e) };
  }
}

/** mapping の構造（itemName / xpath / repeat）だけを取り出す */
export function mappingItems(mappingXml: string): MappingItemInfo[] {
  const doc = parseXml(mappingXml);
  return elementsByTag(doc, 'map').map((map) => ({
    itemName: textContent(elementsByTag(map, 'itemName')[0]),
    xpath: textContent(elementsByTag(map, 'xpath')[0]),
    isRepeat: elementsByTag(map, 'repeat').length > 0,
  }));
}

/** ページ内の情報を集めて返す（値は含めない） */
export function collectDiagnostics(): DiagnosticsDump {
  const w = window as unknown as {
    F3egclMappingInfo?: string;
    F3egclDataStructure?: string;
    F3egclRepeatItem?: string;
    __egovBridgeInstalled?: boolean;
    __egovCmdLog?: string[];
  };
  const mappingXml = w.F3egclMappingInfo ?? '';
  const mapping = census(mappingXml);
  let items: MappingItemInfo[] | undefined;
  if (mappingXml) {
    try {
      items = mappingItems(mappingXml);
    } catch {
      items = undefined;
    }
  }
  return {
    url: location.pathname,
    bridgeInstalled: Boolean(w.__egovBridgeInstalled),
    commandLog: (w.__egovCmdLog ?? []).slice(0, 200),
    mapping: { ...mapping, items },
    structure: census(hexToDecimal(w.F3egclDataStructure ?? '')),
    repeat: census(hexToDecimal(w.F3egclRepeatItem ?? '')),
  };
}

/** ページ内に公開する関数（ポップアップから executeScript で呼ぶ） */
export function installDiagnostics(): void {
  const w = window as unknown as Record<string, unknown>;
  w.egovBridgeCollectDiagnostics = collectDiagnostics;
}
