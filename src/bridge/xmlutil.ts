// XML関連の薄いヘルパ（@xmldom/xmldom ベース）
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const parser = new DOMParser({
  onError: (level, message) => {
    if (level === 'error' || level === 'fatalError') {
      throw new Error(`XML parse error: ${message}`);
    }
    // warn はそのまま（xmldom は厳密でないことがあるが、署名に必要な構造は通常読める）
  },
});

export function parseXml(text: string): Document {
  return parser.parseFromString(text, 'application/xml') as unknown as Document;
}

export function serializeXml(doc: Document | Element): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new XMLSerializer().serializeToString(doc as any);
}

export function childElements(el: Element | Document): Element[] {
  const out: Element[] = [];
  const children = (el as Element).children ?? (el as Document).documentElement?.children ?? [];
  for (let i = 0; i < children.length; i++) {
    if (children[i].nodeType === 1) out.push(children[i] as unknown as Element);
  }
  return out;
}

export function elementsByTag(el: Element | Document, tag: string): Element[] {
  const root = (el as Document).documentElement ?? (el as unknown as Element);
  const list = root.getElementsByTagName(tag);
  const out: Element[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i] as unknown as Element);
  return out;
}

export function firstElementByTag(el: Element | Document, tag: string): Element | null {
  const list = elementsByTag(el, tag);
  return list.length ? (list[0] as Element) : null;
}

export function textContent(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}
