// e-Gov電子申請ブリッジ v2 — MAIN world エントリポイント
//
// ページから見た window.chrome.webview を本物そっくりに実装し、
// ページ ↔ このスクリプト間の通信をすべてページ内で完結させる。
// ネイティブアプリ相当の処理（署名・送信・ファイル管理）は src/bridge/ 配下の
// モジュール群が担当する。拡張機能の background は使わない。
import { dispatchCommand } from '../bridge/dispatch.js';
import { log } from '../bridge/log.js';

(function installWebViewBridge() {
  'use strict';

  if (window.__egovBridgeInstalled) return;
  Object.defineProperty(window, '__egovBridgeInstalled', { value: true });

  const chromeObj =
    window.chrome && typeof window.chrome === 'object' ? window.chrome : (window.chrome = {});

  const webview = {
    addEventListener(type, fn) {
      if (type === 'message' && typeof fn === 'function') {
        // 互換用: ページが自前でリスナを張る場合に備えたフック。
        // 現在はページ側リスナを通さず直接 dispatch するため no-op に近い保持のみ。
        webview._listeners.add(fn);
      }
    },
    removeEventListener(type, fn) {
      if (type === 'message') webview._listeners.delete(fn);
    },
    _listeners: new Set(),
    postMessage(message) {
      // ページ → ブリッジ
      let parsed;
      try {
        parsed = JSON.parse(String(message));
      } catch (e) {
        log('postMessage: JSON parse failed', e);
        return;
      }
      if (!Array.isArray(parsed) || parsed.length < 1) {
        log('postMessage: unexpected payload', parsed);
        return;
      }
      dispatchCommand(parsed).catch((e) => log('dispatch crashed:', e));
    },
  };
  chromeObj.webview = chromeObj.webview || webview;
  log('bridge installed (document_start)');
})();
