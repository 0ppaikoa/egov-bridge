// 申請フォルダのファイル収集ロジック（署名用・送信用で共通）
import { parseXml, elementsByTag, textContent, firstElementByTag } from './xmlutil.ts';

/** フォルダ内の構成情報XMLを読み、署名・送信の両方で必要なファイル集合を返す */
export interface ProcFileSet {
  /** 構成情報XMLの文字列 */
  koseiXml: string;
  /** ファイル名 -> 内容（proc フォルダ直下のみを想定） */
  files: Map<string, Uint8Array>;
  /** 送信対象の全ファイル名（kousei.xml 自身を除く） */
  sendFileNames: string[];
}

/**
 * @param readFile フォルダ内ファイルを読む関数（procFolder 直下のファイル名を受け取る）
 * @param confInfoName 構成情報XMLのファイル名（通常 kousei.xml）
 */
export function collectProcFiles(
  readFile: (name: string) => Uint8Array,
  confInfoName: string,
): ProcFileSet {
  const koseiBytes = readFile(confInfoName);
  const koseiXml = new TextDecoder('utf-8').decode(koseiBytes);
  const doc = parseXml(koseiXml);
  if (!firstElementByTag(doc, '構成情報')) {
    throw new Error('構成情報要素が見つかりません: ' + confInfoName);
  }

  const files = new Map<string, Uint8Array>();
  files.set(confInfoName, koseiBytes);
  const sendFileNames: string[] = [];

  // 申請書ファイル
  for (const el of elementsByTag(doc, '申請書ファイル名称')) {
    const name = textContent(el);
    if (!name) continue;
    if (!files.has(name)) {
      files.set(name, readFile(name));
      sendFileNames.push(name);
    }
  }

  // 添付書類（添付種別=添付のもの全て。送信は提出情報の値を見ない）
  const names = elementsByTag(doc, '添付書類ファイル名称');
  const kinds = elementsByTag(doc, '添付種別');
  for (let i = 0; i < names.length; i++) {
    const kind = textContent(kinds[i]);
    const name = textContent(names[i]);
    if (kind === '添付' && name && !files.has(name)) {
      files.set(name, readFile(name));
      sendFileNames.push(name);
    }
  }

  return { koseiXml, files, sendFileNames };
}
