// isolated world で動作する中継役。
// ページ (MAIN world, shim.js) と service worker (background.js) の間でメッセージを受け渡す。
(function () {
  'use strict';

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'egov-bridge' || data.direction !== 'page-to-extension') return;

    chrome.runtime.sendMessage(
      { type: 'bridge-request', payload: data.payload },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[egov-bridge] runtime error:', chrome.runtime.lastError.message);
          return;
        }
        if (response && typeof response.json === 'string') {
          window.postMessage(
            { source: 'egov-bridge', direction: 'extension-to-page', json: response.json },
            window.location.origin
          );
        }
      }
    );
  });

  // （デバッグ用）service worker からの一方通行通知
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'bridge-push') return;
    window.postMessage(
      { source: 'egov-bridge', direction: 'extension-to-page', json: msg.json },
      window.location.origin
    );
  });
})();
