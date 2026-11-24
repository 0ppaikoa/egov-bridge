// デジタル認証（デジタル認証アプリ）による署名
// POST /digital-auth/start-sign → 認可URLが返る → ユーザーがスマホで署名 →
// GET /digital-auth/poll?signTransactionId=... をポーリング → 署名値と証明書を取得
import { postForm, get } from './http.ts';
import { state } from './state.ts';

const VIRTUAL_PATH = '/recept'; // 本番・検証環境ともに同じ仮想パス

export interface StartSignResult {
  sign_transaction_id: string;
  authorization_url: string;
  wait_time_ms?: string;
  max_retries?: string;
  poll_interval_ms?: string;
}

export interface PollResult {
  status: 'pending' | 'done' | 'error' | 'cancelled';
  signature?: string;
  certificate?: string;
  error?: string;
}

export async function startDigitalAuth(
  base64CanonicalData: string,
  targetProcId: string,
  dispProcName: string,
): Promise<StartSignResult> {
  const res = await postForm(`${VIRTUAL_PATH}/digital-auth/start-sign`, {
    data: base64CanonicalData,
    targetProcId,
    dispProcName,
  });
  if (res.status !== 200) {
    throw new Error(`start-sign が失敗しました (HTTP ${res.status}): ${truncate(res.text)}`);
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new Error('start-sign の応答が JSON ではありません');
  }
  if (
    !json ||
    typeof json.authorization_url !== 'string' ||
    typeof json.sign_transaction_id !== 'string'
  ) {
    throw new Error('start-sign の応答に authorization_url / sign_transaction_id がありません');
  }
  return {
    sign_transaction_id: json.sign_transaction_id,
    authorization_url: json.authorization_url,
    wait_time_ms: str(json.wait_time_ms),
    max_retries: str(json.max_retries),
    poll_interval_ms: str(json.poll_interval_ms),
  };
}

/** 認証URLを新しいタブで開く。ブロックされた場合は false */
export function openAuthorizationUrl(url: string): boolean {
  const win = window.open(url, '_blank', 'noopener');
  if (win) return true;
  // ポップアップブロック時は、ページ内のリンクにフォールバックさせるため false を返す
  return false;
}

export async function pollDigitalAuthOnce(signTransactionId: string): Promise<PollResult> {
  const res = await get(
    `${VIRTUAL_PATH}/digital-auth/poll?signTransactionId=${encodeURIComponent(signTransactionId)}`,
  );
  if (res.status !== 200) {
    // ネイティブ実装は非200を一時エラーとみなしてリトライ継続する
    return { status: 'pending' };
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(res.text);
  } catch {
    return { status: 'pending' };
  }
  if (json.IsError === true) {
    return {
      status: 'error',
      error: typeof json.Certificate === 'string' ? json.Certificate : '署名に失敗しました',
    };
  }
  if (typeof json.Signature === 'string' && json.Signature) {
    return {
      status: 'done',
      signature: json.Signature,
      certificate: String(json.Certificate ?? ''),
    };
  }
  return { status: 'pending' };
}

export interface PollOptions {
  waitTimeMs: number;
  pollIntervalMs: number;
  maxRetries: number;
  onStatus?: (message: string) => void;
}

/** 完了までポーリング。キャンセルは state.digitalAuth.cancelRequested を見る */
export async function waitForSignature(
  signTransactionId: string,
  opts: PollOptions,
): Promise<PollResult> {
  const da = state.digitalAuth;
  da.polling = true;
  da.cancelRequested = false;
  da.signTransactionId = signTransactionId;
  try {
    await sleep(opts.waitTimeMs);
    for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
      if (da.cancelRequested) return { status: 'cancelled' };
      const result = await pollDigitalAuthOnce(signTransactionId);
      if (result.status !== 'pending') return result;
      await sleep(opts.pollIntervalMs);
    }
    return {
      status: 'error',
      error: 'タイムアウトしました（スマートフォンでの署名が完了していません）',
    };
  } finally {
    da.polling = false;
    da.signTransactionId = null;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);
const truncate = (s: string | undefined, n = 300) => (s ?? '').slice(0, n);
