// ページからのメッセージをコマンドハンドラへルーティングする。
// ネイティブ側 DispatchExternal の簡易版。未実装コマンドは明示的に reject を返す
// （ネイティブは「黙って無視」だったが、こちらは原因が分かるようにする）。
import { respondResolve, respondResolveJson, respondReject } from './respond.js';
import { COMMANDS } from './commands-index.js';
import { log } from './log.js';

export async function dispatchCommand(payload) {
  const cmd = payload[0];
  if (typeof cmd !== 'string') {
    log('dispatch: non-string command', payload);
    return;
  }
  const entry = COMMANDS[cmd];
  if (!entry) {
    // 未知コマンドはネイティブ同様に黙って無視する（ページを壊さない）。
    // 実装状況の確認は console と、開発者向けの KNOWN 一覧で行う。
    log('unknown command ignored:', cmd);
    return;
  }
  const oneWay = !!entry.oneWay;
  const args = oneWay ? payload.slice(1) : payload.slice(2);
  const uuid = oneWay ? null : String(payload[1]);
  try {
    const result = await entry.fn(args);
    if (oneWay) return;
    if (result && typeof result === 'object' && '__resolveJson' in result) {
      respondResolveJson(uuid, result.value);
    } else if (typeof result === 'number') {
      respondResolve(uuid, result);
    } else {
      respondResolve(uuid, result == null ? '' : String(result));
    }
  } catch (err) {
    console.error('[egov-bridge] command failed:', cmd, err);
    if (!oneWay) respondReject(uuid, err && err.message ? err.message : String(err));
  }
}

// ハンドラ側で resolveJson を返却したい場合のラッパ
export function asJson(value) {
  return { __resolveJson: true, value };
}
