// デバッグログ。常に console に出すが、localStorage.egovBridgeDebug='0' で抑制可能。
export function log(...args: unknown[]): void {
  try {
    if (localStorage.getItem('egovBridgeDebug') === '0') return;
  } catch {
    // localStorage に触れない環境では黙って出す
  }
  console.log('[egov-bridge]', ...args);
}
