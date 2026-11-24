// e-Gov電子申請ブリッジ — MAIN world エントリポイント
//
// ページから見た window.chrome.webview を本物そっくりに実装し、
// ページ ↔ このスクリプト間の通信をすべてページ内で完結させる。
// ネイティブアプリ相当の処理（署名・送信・ファイル管理）は src/bridge/ 配下の
// モジュール群が担当する。拡張機能の background は使わない。
import { dispatchCommand } from '../bridge/dispatch.js';
import { log } from '../bridge/log.js';

interface WebviewLike {
  addEventListener(type: string, fn: unknown): void;
  removeEventListener(type: string, fn: unknown): void;
  postMessage(message: unknown): void;
  _listeners: Set<unknown>;
}

(function installWebViewBridge(): void {
  'use strict';

  const w = window as unknown as Record<string, unknown> & { chrome?: Record<string, unknown> };
  if (w.__egovBridgeInstalled) return;
  Object.defineProperty(window, '__egovBridgeInstalled', { value: true });

  const chromeObj = (
    w.chrome && typeof w.chrome === 'object' ? w.chrome : (w.chrome = {})
  ) as Record<string, unknown>;

  const listeners = new Set<unknown>();
  const webview: WebviewLike = {
    addEventListener(type: string, fn: unknown) {
      if (type === 'message' && typeof fn === 'function') listeners.add(fn);
    },
    removeEventListener(type: string, fn: unknown) {
      if (type === 'message') listeners.delete(fn);
    },
    _listeners: listeners,
    postMessage(message: unknown): void {
      // ページ → ブリッジ
      let parsed: unknown;
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
      void dispatchCommand(parsed).catch((e: unknown) => log('dispatch crashed:', e));
    },
  };
  chromeObj.webview = chromeObj.webview ?? webview;
  log('bridge installed (document_start)');
})();
