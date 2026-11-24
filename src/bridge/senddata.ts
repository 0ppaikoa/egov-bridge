// 申請データの ZIP 化と AppDataReceive への分割アップロード
// ネイティブ実装（SignatureAppli.SendHttpRequest / compressTransmittingData）の再現。
import { vfs } from './vfs.ts';
import { zipFromEntries } from './zip.ts';
import { postBinary } from './http.ts';
import { collectProcFiles } from './procfiles.ts';

const VIRTUAL_PATH = '/recept';
export const DIV_SIZE = 31_457_280; // ネイティブの DIV_SIZE と同値

function procFolder(identifier: string, procId: string): string {
  return `/work/${identifier}/${procId}`;
}

export interface SendOptions {
  divSize?: number;
  preSendFlag?: boolean;
  saveFlag?: boolean;
}

export type SendResult =
  | { ok: true }
  | { ok: false; code: 'WAF'; supportId: string }
  | { ok: false; code: 'FORM' | 'EXCEPTION' | 'HTTP' | 'OTHER'; detail: string };

/** 申請データを ZIP にして分割送信する。成功時 code 0 相当 */
export async function sendAppliData(
  identifier: string,
  procIds: string[],
  confInfoName: string,
  options: SendOptions = {},
): Promise<SendResult> {
  const divSize = options.divSize && options.divSize > 0 ? options.divSize : DIV_SIZE;

  // 1) 送信ファイル収集と ZIP 作成
  const entries = new Map<string, Uint8Array>();
  for (const procId of procIds) {
    const folder = procFolder(identifier, procId);
    const collected = collectProcFiles((name) => vfs.readFile(`${folder}/${name}`), confInfoName);
    entries.set(`${procId}/`, new Uint8Array());
    for (const name of [confInfoName, ...collected.sendFileNames]) {
      const data = collected.files.get(name);
      if (data) entries.set(`${procId}/${name}`, data);
    }
  }
  const zipBytes = zipFromEntries(entries);

  // 2) 分割アップロード
  const total = zipBytes.length;
  let position = 0;
  while (position < total) {
    const chunk = zipBytes.subarray(position, Math.min(position + divSize, total));
    const res = await postBinary(`${VIRTUAL_PATH}/application-form-entry/AppDataReceive`, chunk, {
      zipFullSize: String(total),
      zipPosition: String(position),
      preSendFlag: options.preSendFlag ? '1' : '0',
      signAndSaveFlag: options.saveFlag ? '1' : '0',
    });
    if (res.status !== 200) {
      return { ok: false, code: 'HTTP', detail: `HTTP ${res.status}` };
    }
    const errorInfo = res.headers.get('ErrorInfo');
    if (errorInfo) {
      if (errorInfo === 'Unknown error.(server error)') {
        return { ok: false, code: 'EXCEPTION', detail: errorInfo };
      }
      return { ok: false, code: 'FORM', detail: errorInfo };
    }
    if (res.text.includes('The requested URL was rejected')) {
      const m = /Your support ID is: ([^<]+)/.exec(res.text);
      return {
        ok: false,
        code: 'WAF',
        supportId: m ? m[1].trim() : '(support ID を取得できませんでした)',
      };
    }
    if (!res.headers.get('AppDataReceiveFlag')) {
      return { ok: false, code: 'OTHER', detail: 'AppDataReceiveFlag ヘッダがありません' };
    }
    position += chunk.length;
  }
  return { ok: true };
}
