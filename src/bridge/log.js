// デバッグログ。常に console に出すが、localStorage.egovBridgeDebug='0' で抑制可能。
const enabled = () => {
  try { return localStorage.getItem('egovBridgeDebug') !== '0'; } catch { return true; }
};
export function log(...args) {
  if (enabled()) console.log('[egov-bridge]', ...args);
}
