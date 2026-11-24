// ページコンテキストからの same-origin fetch ラッパ。
// ネイティブアプリ（ProxyUtil.getHttpWebRequest）と同等のヘッダを付与する。
// - X-CSRF-Token: hidden input _csrf の値（ネイティブは EvaluateJavaScript で取得）
// - X-Requested-With: XMLHttpRequest
// - credentials: same-origin（JSESSIONID はブラウザ管理。HTTPOnlyでも送信される）

export function getCsrfToken(): string {
  const input = document.getElementsByName('_csrf')[0] as HTMLInputElement | undefined;
  return input?.value ?? '';
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  text: string;
  bytes: Uint8Array;
}

export async function postForm(
  path: string,
  form: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResponse> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) body.set(k, v);
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'X-CSRF-Token': getCsrfToken(),
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
    body: body.toString(),
  });
  return readResponse(res);
}

export async function postBinary(
  path: string,
  body: Uint8Array,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResponse> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-CSRF-Token': getCsrfToken(),
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
    body: body as unknown as BodyInit,
  });
  return readResponse(res);
}

export async function get(path: string, extraHeaders: Record<string, string> = {}): Promise<HttpResponse> {
  const res = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      'X-CSRF-Token': getCsrfToken(),
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
  });
  return readResponse(res);
}

async function readResponse(res: Response): Promise<HttpResponse> {
  const buf = new Uint8Array(await res.arrayBuffer());
  let text = '';
  try {
    text = new TextDecoder('utf-8').decode(buf);
  } catch {
    text = '';
  }
  return { status: res.status, ok: res.ok, headers: res.headers, text, bytes: buf };
}
