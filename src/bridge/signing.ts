// 署名オーケストレーション（デジタル認証アプリ方式）
// ネイティブの saveXmlAndSign のうち、署名部分を再構成したもの。
// 前後の business フロー（pre-send/post-send、バックアップ）は sendappli モジュール側で組む。
import { vfs } from './vfs.ts';
import { collectProcFiles } from './procfiles.ts';
import { prepareSigning, assembleSignedXml, signatureTimestampId } from './signature.ts';
import { startDigitalAuth, waitForSignature, openAuthorizationUrl } from './digital-auth.ts';
import { log } from './log.ts';

export interface SignProcResult {
  procId: string;
  signatureId: string;
}

/**
 * 指定プロセスの構成情報XMLをデジタル認証で署名し、VFSに書き戻す。
 * 成功すると署名済みXMLが <procFolder>/<confInfoName> に保存される。
 */
export async function signProcWithDigitalAuth(
  identifier: string,
  procId: string,
  confInfoName: string,
  dispProcName?: string,
): Promise<SignProcResult> {
  const folder = `/work/${identifier}/${procId}`;
  const collected = collectProcFiles((name) => vfs.readFile(`${folder}/${name}`), confInfoName);
  const signatureId = signatureTimestampId();
  const prep = await prepareSigning(collected.koseiXml, collected.files, signatureId);

  log('start digital-auth signing', { identifier, procId, signatureId });
  const start = await startDigitalAuth(prep.base64CanonicalData, procId, dispProcName ?? procId);

  if (!openAuthorizationUrl(start.authorization_url)) {
    // ポップアップが止められた場合は URL を例外メッセージに含めて表示させる
    throw new Error(`ポップアップがブロックされました。次のURLをブラウザで開いて署名してください: ${start.authorization_url}`);
  }

  const waitMs = Number.parseInt(start.wait_time_ms ?? '60000', 10) || 60000;
  const intervalMs = Number.parseInt(start.poll_interval_ms ?? '3000', 10) || 3000;
  const maxRetries = Number.parseInt(start.max_retries ?? '80', 10) || 80;

  const result = await waitForSignature(start.sign_transaction_id, {
    waitTimeMs: waitMs,
    pollIntervalMs: intervalMs,
    maxRetries,
  });

  if (result.status === 'cancelled') {
    throw new Error('署名がキャンセルされました');
  }
  if (result.status !== 'done' || !result.signature || !result.certificate) {
    throw new Error(result.error ?? 'デジタル認証に失敗しました');
  }

  const signedXml = assembleSignedXml(
    collected.koseiXml,
    prep.refs,
    prep.signatureId,
    result.signature,
    result.certificate,
  );
  vfs.writeFile(`${folder}/${confInfoName}`, signedXml);
  return { procId, signatureId: prep.signatureId };
}
