// ページ側へ応答を返す際のヘルパ。ネイティブ側の応答形式を忠実に再現する。
//
// 形式（デコンパイル結果より）:
//   {"uuid":"...", "resolve":<string|number>}   // 文字列はJSONエスケープ付き
//   {"uuid":"...", "resolveJson":<object>}      // JSONをそのまま埋め込む
//   {"uuid":"...", "reject":"<message>"}        // 例外メッセージ（生埋め込みだが安全のためJSON.stringifyする）

const LISTENERS = [
  'F3egclMessageEventListenerMac',
  'F3egclMessageEventListenerWin',
  'F3egclMessageEventListener',
];

function deliver(json) {
  let called = false;
  for (const name of LISTENERS) {
    const fn = window[name];
    if (typeof fn === 'function') {
      try {
        fn(json);
        called = true;
      } catch (e) {
        console.error('[egov-bridge] page listener threw:', e);
      }
      return; // 先頭のリスナのみ呼ぶ（ネイティブ側がInvokeScript(name)するのと同じ）
    }
  }
  if (!called) {
    console.warn('[egov-bridge] no page listener registered; response dropped', json);
  }
}

export function respondResolve(uuid, value) {
  let inner;
  if (typeof value === 'number') inner = String(value);
  else inner = JSON.stringify(String(value ?? ''));
  deliver(`{"uuid":${JSON.stringify(String(uuid))},"resolve":${inner}}`);
}

export function respondResolveJson(uuid, obj) {
  deliver(`{"uuid":${JSON.stringify(String(uuid))},"resolveJson":${JSON.stringify(obj ?? null)}}`);
}

export function respondReject(uuid, message) {
  deliver(`{"uuid":${JSON.stringify(String(uuid))},"reject":${JSON.stringify(String(message ?? 'unknown error'))}}`);
}
