// e-Gov電子申請ブリッジ — MAIN world エントリポイント
//
// ページから見た window.chrome.webview を本物そっくりに実装し、
// ページ ↔ このスクリプト間の通信をすべてページ内で完結させる。
// ネイティブアプリ相当の処理（署名・送信・ファイル管理）は src/bridge/ 配下の
// モジュール群が担当する。拡張機能の background は使わない。
import { dispatchCommand } from '../bridge/dispatch.ts';
import { log } from '../bridge/log.ts';
import { installDiagnostics } from '../bridge/diagnostics.ts';

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

  // どのコマンドが飛んだかだけを記録する（引数は保存しない＝個人情報を含めない）
  const commandLog: string[] = [];
  Object.defineProperty(window, '__egovCmdLog', { value: commandLog });

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
      if (typeof parsed[0] === 'string') {
        commandLog.push(parsed[0]);
        if (commandLog.length > 500) commandLog.shift();
      }
      void dispatchCommand(parsed).catch((e: unknown) => log('dispatch crashed:', e));
    },
  };
  chromeObj.webview = chromeObj.webview ?? webview;

  // ポップアップ（chrome.scripting.executeScript）から診断情報を取れるようにする
  installDiagnostics();

  log('bridge installed (document_start)');
})();
