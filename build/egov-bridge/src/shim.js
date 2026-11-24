// MAIN world で動作し、ページ側から見た `window.chrome.webview` を
// 拡張機能との通信路に作り替える。
//
// e-Gov電子申請Webアプリは元来 WebView2 (window.chrome.webview) 向けに書かれており、
// macOS版アプリはこれを window.webkit.messageHandlers.F3egclPostMessage に橋渡しする
// ポリフィルを注入している。本拡張は同様の手口で postMessage を捕捉し、
// isolated world 側 (bridge.js) → service worker (background.js) へ転送する。
(function () {
  'use strict';

  if (window.__egovBridgeInstalled) return;
  Object.defineProperty(window, '__egovBridgeInstalled', { value: true });

  const chromeObj = (window.chrome && typeof window.chrome === 'object') ? window.chrome : (window.chrome = {});
  const listeners = new Set();

  const webview = {
    addEventListener(type, fn) {
      if (type === 'message' && typeof fn === 'function') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'message') listeners.delete(fn);
    },
    postMessage(message) {
      // ページ → 拡張
      window.postMessage({ source: 'egov-bridge', direction: 'page-to-extension', payload: String(message) }, window.location.origin);
    },
  };
  chromeObj.webview = webview;

  // 拡張 → ページへの応答チャネル。
  // アプリが window.F3egclMessageEventListenerMac / F3egclMessageEventListenerWin /
  // F3egclMessageEventListener のいずれかを定義している前提で呼びに行く。
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'egov-bridge' || data.direction !== 'extension-to-page') return;
    const json = data.json;
    for (const name of ['F3egclMessageEventListenerMac', 'F3egclMessageEventListenerWin', 'F3egclMessageEventListener']) {
      const fn = window[name];
      if (typeof fn === 'function') {
        try {
          fn(json);
        } catch (err) {
          console.error('[egov-bridge] listener threw:', err);
        }
        return;
      }
    }
    // リスナが未登録なら CustomEvent として残す（デバッグ用）
    window.dispatchEvent(new CustomEvent('egov-bridge:unhandled-response', { detail: json }));
  });
})();
