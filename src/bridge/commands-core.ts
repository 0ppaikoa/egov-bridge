// 署名・送信パイプラインの本体。SignAndSend / SignAndSave 系コマンドを提供する。
// ネイティブ（F3egclFileManageAppli_SignAndSend 等）の流れを踏襲:
//   1) pre-send（preSendFlag=(signFlag=="1")）
//   2) signFlag==1 のとき、各プロセスをデジタル認証で署名して書き戻す
//   3) 本送信（preSendFlag=false, saveFlag 付き）
import { vfs } from './vfs.ts';
import { sendAppliData } from './senddata.ts';
import { signProcWithDigitalAuth } from './signing.ts';
import { state } from './state.ts';

export interface SignSendOptions {
  signatureId?: string;
  saveFlag: boolean;
  /** SignAndSend の signMaxFlag。true の場合、バックアップ→無署名送信に振る舞う（ネイティブ準拠） */
  signMaxFlag?: string;
  signInfoJson?: string;
}

function parseProcIds(list: string): string[] {
  return list.split(':::').map((s) => s.trim()).filter(Boolean);
}

/**
 * 署名→送信の共通実装。戻り値はネイティブ互換の終了コード（0=成功）。
 * 失敗時は例外を投げる（dispatcher が reject に変換する）。
 */
export async function signAndSendCore(
  identifier: string,
  procIdListStr: string,
  confInfoName: string,
  signFlag: string,
  opts: SignSendOptions,
): Promise<number> {
  const ids = parseProcIds(procIdListStr);
  if (ids.length === 0) throw new Error('procIdListStr が空です');

  // 1) pre-send
  const pre = await sendAppliData(identifier, ids, confInfoName, {
    preSendFlag: signFlag === '1',
    saveFlag: opts.saveFlag,
  });
  if (!pre.ok) {
    throw new Error(`pre-send に失敗しました: ${pre.code} ${'supportId' in pre ? pre.supportId : pre.detail}`);
  }

  // 2) 署名（signFlag=1 のときのみ）
  if (signFlag === '1') {
    for (const procId of ids) {
      if (state.digitalAuth.cancelRequested) throw new Error('署名がキャンセルされました');
      await signProcWithDigitalAuth(identifier, procId, confInfoName);
    }
  }

  // 3) 本送信
  const main = await sendAppliData(identifier, ids, confInfoName, {
    preSendFlag: false,
    saveFlag: opts.saveFlag,
  });
  if (!main.ok) {
    throw new Error(`送信に失敗しました: ${main.code} ${'supportId' in main ? main.supportId : main.detail}`);
  }
  return 0;
}

export async function cmdSignAndSend(args: string[]): Promise<number> {
  // identifier, procIdListStr, fabFormFileName, signFlag, signMaxFlag, addSignFlag, signatureId[, signInfoJson]
  const [identifier, procIdListStr, fabFormFileName, signFlag, signMaxFlag, _addSignFlag, signatureId, signInfoJson] =
    args;
  if (!identifier) throw new Error('identifier がありません');
  if (!procIdListStr) throw new Error('procIdList がありません');
  if (!fabFormFileName) throw new Error('fabFormFileName がありません');
  const useBackup = String(signMaxFlag).toLowerCase() === 'true';
  if (useBackup) {
    // ネイティブではバックアップ→無署名送信だが、現状バックアップ機構がないため明示的に拒否する
    throw new Error('signMaxFlag=true（申請データのバックアップ送信）は未実装です。バックアップが必要な場合はアプリを使用してください');
  }
  return signAndSendCore(identifier, procIdListStr, fabFormFileName, signFlag, {
    signatureId,
    saveFlag: false,
    signInfoJson,
  });
}

export async function cmdSignAndSave(args: string[]): Promise<number> {
  // identifier, procIdListStr, fabFormFileName, signFlag, addSignFlag, signatureId[, signInfoJson]
  const [identifier, procIdListStr, fabFormFileName, signFlag, _addSignFlag, signatureId, signInfoJson] = args;
  if (!identifier) throw new Error('identifier がありません');
  if (!procIdListStr) throw new Error('procIdList がありません');
  if (!fabFormFileName) throw new Error('fabFormFileName がありません');
  return signAndSendCore(identifier, procIdListStr, fabFormFileName, signFlag, {
    signatureId,
    saveFlag: true,
    signInfoJson,
  });
}

export function cmdStoreWorkXmlFile(args: string[]): number {
  // identifier, procName, workXmlFile, xmlDoc
  const [identifier, procName, workXmlFile, xmlDoc] = args;
  if (!identifier || !procName || !workXmlFile) {
    throw new Error('storeWorkXMLFile: 引数が不足しています');
  }
  if (xmlDoc == null) throw new Error('storeWorkXMLFile: xmlDoc が空です');
  vfs.writeFile(`/work/${identifier}/${procName}/${workXmlFile}`, xmlDoc);
  return 0;
}

export function cmdDeleteWorkData(args: string[]): number {
  const [identifier] = args;
  if (!identifier) throw new Error('identifier がありません');
  vfs.deletePrefix(`/work/${identifier}`);
  return 0;
}

export function cmdInitAttachList(): number {
  // 添付済みファイル名リストの初期化（ネイティブは1を返す）
  state.dicAttachedDocFileNameStatus = new Map();
  return 1;
}

export function cmdOpenInBrowser(args: string[]): void {
  const url = args[0];
  if (url) window.open(url, '_blank', 'noopener');
}
