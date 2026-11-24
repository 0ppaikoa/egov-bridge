// ページからのメッセージをコマンドハンドラへルーティングする。
import { respondResolve, respondResolveJson, respondReject } from './respond.ts';
import { COMMANDS } from './commands-index.ts';
import { log } from './log.ts';

export interface ResolveJsonWrapper<T = unknown> {
  __resolveJson: true;
  value: T;
}

export type CommandResult = string | number | ResolveJsonWrapper<unknown> | void | undefined | null;

export interface CommandEntry {
  oneWay: boolean;
  fn: (args: string[]) => CommandResult | Promise<CommandResult>;
}

export async function dispatchCommand(payload: unknown[]): Promise<void> {
  const cmd = payload[0];
  if (typeof cmd !== 'string') {
    log('dispatch: non-string command', payload);
    return;
  }
  const entry: CommandEntry | undefined = COMMANDS[cmd];
  if (!entry) {
    // 未知コマンドはネイティブ同様に黙って無視する（ページを壊さない）
    log('unknown command ignored:', cmd);
    return;
  }
  const oneWay = !!entry.oneWay;
  const args = (oneWay ? payload.slice(1) : payload.slice(2)).map(String);
  const uuid = oneWay ? null : String(payload[1]);
  try {
    const result = await entry.fn(args);
    if (oneWay) return;
    if (result && typeof result === 'object' && '__resolveJson' in result) {
      respondResolveJson(uuid as string, (result as ResolveJsonWrapper).value);
    } else if (typeof result === 'number') {
      respondResolve(uuid as string, result);
    } else {
      respondResolve(uuid as string, result == null ? '' : String(result));
    }
  } catch (err) {
    console.error('[egov-bridge] command failed:', cmd, err);
    if (!oneWay) respondReject(uuid as string, err instanceof Error ? err.message : String(err));
  }
}

// ハンドラ側で resolveJson を返却したい場合のラッパ
export function asJson<T>(value: T): ResolveJsonWrapper<T> {
  return { __resolveJson: true, value };
}
