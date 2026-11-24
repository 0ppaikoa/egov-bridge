// ページ側へ応答を返す際のヘルパ。ネイティブ側の応答形式を忠実に再現する。
//
// 形式（デコンパイル結果より）:
//   {"uuid":"...", "resolve":<string|number>}   // 文字列はJSONエスケープ付き
//   {"uuid":"...", "resolveJson":<object>}      // JSONをそのまま埋め込む
//   {"uuid":"...", "reject":"<message>"}        // 例外メッセージ（安全のためJSON.stringifyする）

const LISTENERS = [
  'F3egclMessageEventListenerMac',
  'F3egclMessageEventListenerWin',
  'F3egclMessageEventListener',
] as const;

type WindowWithListeners = Window & Record<string, unknown>;

function deliver(json: string): void {
  const w = window as unknown as WindowWithListeners;
  for (const name of LISTENERS) {
    const fn = w[name];
    if (typeof fn === 'function') {
      try {
        (fn as (s: string) => void)(json);
      } catch (e) {
        console.error('[egov-bridge] page listener threw:', e);
      }
      return; // 先頭のリスナのみ呼ぶ（ネイティブ側と同じ挙動）
    }
  }
  console.warn('[egov-bridge] no page listener registered; response dropped', json);
}

export function respondResolve(uuid: string, value: string | number): void {
  const inner = typeof value === 'number' ? String(value) : JSON.stringify(String(value ?? ''));
  deliver(`{"uuid":${JSON.stringify(String(uuid))},"resolve":${inner}}`);
}

export function respondResolveJson(uuid: string, obj: unknown): void {
  deliver(`{"uuid":${JSON.stringify(String(uuid))},"resolveJson":${JSON.stringify(obj ?? null)}}`);
}

export function respondReject(uuid: string, message: string): void {
  deliver(
    `{"uuid":${JSON.stringify(String(uuid))},"reject":${JSON.stringify(String(message ?? 'unknown error'))}}`,
  );
}
